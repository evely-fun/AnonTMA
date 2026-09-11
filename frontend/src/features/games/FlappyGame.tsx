import { useEffect, useRef, useState } from "react";

import { voicePipeline } from "@/features/voice/noise";
import { haptics } from "@/shared/lib/telegram";
import { Button } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import styles from "./games.module.css";

interface View {
  phase: string;
  seed: number;
  difficulty: string;
  players: number[];
  alive: number[];
  scores: Record<string, number>;
  altitudes: Record<string, number>;
  youAlive: boolean;
  yourScore: number;
  winner: number | null;
  secondsLeft: number;
}

interface Pipe {
  x: number;
  gapCenter: number;
  gapSize: number;
  passed: boolean;
}

const WORLD_WIDTH = 360;
const WORLD_HEIGHT = 560;
const BIRD_X = 96;
const BIRD_RADIUS = 13;
const GRAVITY = 900;
const LIFT = 1900;
const MAX_FALL = 620;
const PIPE_WIDTH = 58;
const PIPE_SPACING = 210;
const SPEED = 148;

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const FlappyGame = ({ view }: { view: View }) => {
  const act = useGames((state) => state.act);
  const profile = useSession((state) => state.profile);
  const members = useRooms((state) => state.members);
  const micLevel = useVoice((state) => state.micLevel);
  const voiceActive = useVoice((state) => state.active);
  const enableVoice = useVoice((state) => state.enable);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(0);
  const stateRef = useRef({ y: WORLD_HEIGHT / 2, velocity: 0, distance: 0, score: 0, dead: false });
  const [score, setScore] = useState(0);
  const [ready, setReady] = useState(false);

  levelRef.current = micLevel;

  useEffect(() => {
    if (!voiceActive) {
      void enableVoice();
    }
  }, [voiceActive, enableVoice]);

  useEffect(() => {
    if (view.phase !== "running") {
      stateRef.current = { y: WORLD_HEIGHT / 2, velocity: 0, distance: 0, score: 0, dead: false };
      setScore(0);
      setReady(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = WORLD_WIDTH * ratio;
    canvas.height = WORLD_HEIGHT * ratio;
    context.scale(ratio, ratio);

    const random = mulberry32(view.seed);
    const difficulty = view.difficulty === "hard" ? 0.78 : view.difficulty === "easy" ? 1.25 : 1;
    const pipes: Pipe[] = [];
    for (let index = 0; index < 64; index += 1) {
      pipes.push({
        x: WORLD_WIDTH + 140 + index * PIPE_SPACING,
        gapCenter: 120 + random() * (WORLD_HEIGHT - 260),
        gapSize: 172 * difficulty,
        passed: false,
      });
    }

    setReady(true);
    let frame = 0;
    let last = performance.now();
    let lastReport = 0;

    const draw = (now: number): void => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = stateRef.current;

      if (!world.dead) {
        const lift = Math.max(0, levelRef.current - 0.08) * LIFT;
        world.velocity += (GRAVITY - lift) * delta;
        world.velocity = Math.max(-MAX_FALL, Math.min(MAX_FALL, world.velocity));
        world.y += world.velocity * delta;
        world.distance += SPEED * delta;

        if (world.y < BIRD_RADIUS || world.y > WORLD_HEIGHT - BIRD_RADIUS) {
          world.dead = true;
          haptics.notify("error");
          act("crash", { score: world.score });
        }
      }

      context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      const gradient = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
      gradient.addColorStop(0, "#0d1220");
      gradient.addColorStop(1, "#1a2238");
      context.fillStyle = gradient;
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      context.fillStyle = "rgba(255,255,255,0.05)";
      for (let index = 0; index < 30; index += 1) {
        const x = (index * 137 - world.distance * 0.25) % (WORLD_WIDTH + 40);
        const y = (index * 79) % WORLD_HEIGHT;
        context.fillRect(x < 0 ? x + WORLD_WIDTH + 40 : x, y, 2, 2);
      }

      pipes.forEach((pipe) => {
        const x = pipe.x - world.distance;
        if (x < -PIPE_WIDTH || x > WORLD_WIDTH) {
          return;
        }
        const top = pipe.gapCenter - pipe.gapSize / 2;
        const bottom = pipe.gapCenter + pipe.gapSize / 2;

        const pipeGradient = context.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
        pipeGradient.addColorStop(0, "#6C8CFF");
        pipeGradient.addColorStop(1, "#9C6CFF");
        context.fillStyle = pipeGradient;
        context.fillRect(x, 0, PIPE_WIDTH, top);
        context.fillRect(x, bottom, PIPE_WIDTH, WORLD_HEIGHT - bottom);

        if (!world.dead) {
          const withinX = BIRD_X + BIRD_RADIUS > x && BIRD_X - BIRD_RADIUS < x + PIPE_WIDTH;
          const outsideGap = world.y - BIRD_RADIUS < top || world.y + BIRD_RADIUS > bottom;
          if (withinX && outsideGap) {
            world.dead = true;
            haptics.notify("error");
            act("crash", { score: world.score });
          }
          if (!pipe.passed && x + PIPE_WIDTH < BIRD_X) {
            pipe.passed = true;
            world.score += 1;
            setScore(world.score);
            haptics.impact("light");
          }
        }
      });

      const tilt = Math.max(-0.5, Math.min(0.8, world.velocity / 600));
      context.save();
      context.translate(BIRD_X, world.y);
      context.rotate(tilt);
      const birdGradient = context.createRadialGradient(-4, -4, 2, 0, 0, BIRD_RADIUS + 4);
      birdGradient.addColorStop(0, "#FFE49A");
      birdGradient.addColorStop(1, "#F2A33C");
      context.fillStyle = birdGradient;
      context.beginPath();
      context.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#10141e";
      context.beginPath();
      context.arc(5, -4, 2.4, 0, Math.PI * 2);
      context.fill();
      context.restore();

      const energy = Math.min(1, levelRef.current * 1.4);
      context.fillStyle = "rgba(63,191,143,0.85)";
      context.fillRect(16, WORLD_HEIGHT - 26, 120 * energy, 6);
      context.strokeStyle = "rgba(255,255,255,0.2)";
      context.strokeRect(16, WORLD_HEIGHT - 26, 120, 6);

      if (!world.dead && now - lastReport > 500) {
        lastReport = now;
        act("progress", { score: world.score, altitude: 1 - world.y / WORLD_HEIGHT });
      }

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [view.phase, view.seed, view.difficulty, act]);

  const nameOf = (userId: number): string => {
    if (userId === profile?.id) {
      return "You";
    }
    return members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `Player ${userId}`;
  };

  return (
    <div className={styles.stage}>
      <div className={styles.statusBar}>
        <div>
          <span className={styles.phase}>Voice flappy</span>
          <span className={styles.phaseValue}>Score {score}</span>
        </div>
        <span className={styles.countdown}>{view.alive.length} alive</span>
      </div>

      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
        {view.phase === "countdown" ? (
          <div className={styles.canvasOverlay}>
            <span className={styles.bigNumber}>{view.secondsLeft}</span>
            <p className={styles.hint}>Hum, sing or talk to lift the bird. Silence makes it drop.</p>
          </div>
        ) : null}
        {view.phase === "running" && !ready ? (
          <div className={styles.canvasOverlay}>
            <p className={styles.hint}>Loading the world…</p>
          </div>
        ) : null}
        {view.phase === "finished" ? (
          <div className={styles.canvasOverlay}>
            <span className={styles.bigNumber}>{view.scores[String(profile?.id ?? 0)] ?? score}</span>
            <p className={styles.hint}>
              {view.winner === profile?.id ? "You flew the furthest" : `${nameOf(view.winner ?? 0)} won this round`}
            </p>
          </div>
        ) : null}
        {view.phase === "running" && !view.youAlive ? (
          <div className={styles.canvasOverlay}>
            <p className={styles.hint}>You crashed. Watching the rest of the flock.</p>
          </div>
        ) : null}
      </div>

      <div className={styles.micMeter}>
        <span>🎙</span>
        <div className={styles.micTrack}>
          <span className={styles.micFill} style={{ width: `${Math.min(100, micLevel * 130)}%` }} />
        </div>
        {!voiceActive ? (
          <Button size="sm" onClick={() => void voicePipeline.start()}>
            Allow mic
          </Button>
        ) : null}
      </div>
    </div>
  );
};
