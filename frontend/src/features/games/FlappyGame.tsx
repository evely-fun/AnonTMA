import { useEffect, useRef, useState } from "react";

import { haptic } from "@/shared/lib/telegram";
import { Button, LevelBars } from "@/shared/ui";
import { MicIcon } from "@/shared/ui/icons";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import { GameStatus } from "./shared";

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
  const world = useRef({ y: WORLD_HEIGHT / 2, velocity: 0, distance: 0, score: 0, dead: false });
  const [score, setScore] = useState(0);

  levelRef.current = micLevel;

  useEffect(() => {
    if (!voiceActive) void enableVoice();
  }, [voiceActive, enableVoice]);

  useEffect(() => {
    if (view.phase !== "running") {
      world.current = { y: WORLD_HEIGHT / 2, velocity: 0, distance: 0, score: 0, dead: false };
      setScore(0);
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = WORLD_WIDTH * ratio;
    canvas.height = WORLD_HEIGHT * ratio;
    context.scale(ratio, ratio);

    const random = mulberry32(view.seed);
    const difficulty = view.difficulty === "hard" ? 0.78 : view.difficulty === "easy" ? 1.25 : 1;
    const pipes: Pipe[] = Array.from({ length: 64 }, (_, index) => ({
      x: WORLD_WIDTH + 140 + index * PIPE_SPACING,
      gapCenter: 120 + random() * (WORLD_HEIGHT - 260),
      gapSize: 172 * difficulty,
      passed: false,
    }));

    let frame = 0;
    let last = performance.now();
    let lastReport = 0;

    const draw = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = world.current;

      if (!state.dead) {
        const lift = Math.max(0, levelRef.current - 0.08) * LIFT;
        state.velocity += (GRAVITY - lift) * delta;
        state.velocity = Math.max(-MAX_FALL, Math.min(MAX_FALL, state.velocity));
        state.y += state.velocity * delta;
        state.distance += SPEED * delta;

        if (state.y < BIRD_RADIUS || state.y > WORLD_HEIGHT - BIRD_RADIUS) {
          state.dead = true;
          haptic.notify("error");
          act("crash", { score: state.score });
        }
      }

      context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
      sky.addColorStop(0, "#0a1220");
      sky.addColorStop(1, "#131a26");
      context.fillStyle = sky;
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      context.fillStyle = "rgba(255,255,255,0.05)";
      for (let index = 0; index < 30; index += 1) {
        const x = (index * 137 - state.distance * 0.25) % (WORLD_WIDTH + 40);
        const y = (index * 79) % WORLD_HEIGHT;
        context.fillRect(x < 0 ? x + WORLD_WIDTH + 40 : x, y, 2, 2);
      }

      pipes.forEach((pipe) => {
        const x = pipe.x - state.distance;
        if (x < -PIPE_WIDTH || x > WORLD_WIDTH) return;
        const top = pipe.gapCenter - pipe.gapSize / 2;
        const bottom = pipe.gapCenter + pipe.gapSize / 2;

        context.fillStyle = "#1d2534";
        context.fillRect(x, 0, PIPE_WIDTH, top);
        context.fillRect(x, bottom, PIPE_WIDTH, WORLD_HEIGHT - bottom);
        context.fillStyle = "#35b3ee";
        context.fillRect(x, top - 4, PIPE_WIDTH, 4);
        context.fillRect(x, bottom, PIPE_WIDTH, 4);

        if (!state.dead) {
          const withinX = BIRD_X + BIRD_RADIUS > x && BIRD_X - BIRD_RADIUS < x + PIPE_WIDTH;
          const outsideGap = state.y - BIRD_RADIUS < top || state.y + BIRD_RADIUS > bottom;
          if (withinX && outsideGap) {
            state.dead = true;
            haptic.notify("error");
            act("crash", { score: state.score });
          }
          if (!pipe.passed && x + PIPE_WIDTH < BIRD_X) {
            pipe.passed = true;
            state.score += 1;
            setScore(state.score);
            haptic.impact("light");
          }
        }
      });

      const tilt = Math.max(-0.5, Math.min(0.8, state.velocity / 600));
      context.save();
      context.translate(BIRD_X, state.y);
      context.rotate(tilt);
      context.fillStyle = "#f3c969";
      context.beginPath();
      context.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#06080f";
      context.beginPath();
      context.arc(5, -4, 2.4, 0, Math.PI * 2);
      context.fill();
      context.restore();

      if (!state.dead && now - lastReport > 500) {
        lastReport = now;
        act("progress", { score: state.score, altitude: 1 - state.y / WORLD_HEIGHT });
      }

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [view.phase, view.seed, view.difficulty, act]);

  const nameOf = (userId: number) =>
    userId === profile?.id
      ? "You"
      : (members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `P${userId}`);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <GameStatus
        eyebrow="Voice flappy"
        title={`Score ${score}`}
        trailing={
          <span className="rounded-full bg-elevated px-3 py-1.5 font-display text-[12px] font-bold tabular">
            {view.alive.length} alive
          </span>
        }
      />

      <div className="relative flex-1 overflow-hidden rounded-[20px] border border-separator">
        <canvas ref={canvasRef} className="block size-full" />

        {view.phase === "countdown" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgb(6_8_15/0.62)] px-8 text-center backdrop-blur-sm">
            <span className="font-display text-[56px] font-extrabold tracking-[-0.04em] tabular">
              {view.secondsLeft}
            </span>
            <p className="text-[13.5px] leading-snug text-secondary">
              Hum, sing or talk to lift the bird. Silence makes it drop.
            </p>
          </div>
        )}

        {view.phase === "finished" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgb(6_8_15/0.72)] px-8 text-center backdrop-blur-sm">
            <span className="font-display text-[56px] font-extrabold tracking-[-0.04em] tabular">
              {view.scores[String(profile?.id ?? 0)] ?? score}
            </span>
            <p className="text-[13.5px] text-secondary">
              {view.winner === profile?.id
                ? "You flew the furthest"
                : `${nameOf(view.winner ?? 0)} won this round`}
            </p>
          </div>
        )}

        {view.phase === "running" && !view.youAlive && (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgb(6_8_15/0.6)] px-8 text-center backdrop-blur-sm">
            <p className="text-[13.5px] text-secondary">
              You crashed. Watching the rest of the flock.
            </p>
          </div>
        )}
      </div>

      <div className="panel flex items-center gap-3 rounded-[16px] px-4 py-3">
        <span className="text-live">
          <MicIcon size={17} />
        </span>
        <div className="flex-1">
          <LevelBars level={micLevel} bars={26} />
        </div>
        {!voiceActive && (
          <Button size="sm" variant="surface" onClick={() => void enableVoice()}>
            Allow mic
          </Button>
        )}
      </div>
    </div>
  );
};
