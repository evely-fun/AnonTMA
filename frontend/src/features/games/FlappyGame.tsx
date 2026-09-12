import { useEffect, useRef, useState } from "react";

import { useT } from "@/shared/i18n";
import { haptic } from "@/shared/lib/telegram";
import { Button, LevelBars } from "@/shared/ui";
import { MicIcon } from "@/shared/ui/icons";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import {
  BIRD_RADIUS,
  BIRD_X,
  FlappyScene,
  GROUND_HEIGHT,
  PIPE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type ScenePipe,
} from "./flappyScene";
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

type Pipe = ScenePipe & { passed: boolean };

const GRAVITY = 900;
const LIFT = 1900;
const MAX_FALL = 620;
const PIPE_SPACING = 210;
const SPEED = 148;
const PLAY_HEIGHT = WORLD_HEIGHT - GROUND_HEIGHT;
const CEILING = BIRD_RADIUS;
const FLOOR = PLAY_HEIGHT - BIRD_RADIUS;

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
  const { t } = useT();
  const act = useGames((state) => state.act);
  const profile = useSession((state) => state.profile);
  const members = useRooms((state) => state.members);
  const micLevel = useVoice((state) => state.micLevel);
  const voiceActive = useVoice((state) => state.active);
  const enableVoice = useVoice((state) => state.enable);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(0);
  const world = useRef({ y: PLAY_HEIGHT / 2, velocity: 0, distance: 0, score: 0, level: 0, dead: false });
  const [score, setScore] = useState(0);

  levelRef.current = micLevel;

  useEffect(() => {
    if (!voiceActive) void enableVoice();
  }, [voiceActive, enableVoice]);

  useEffect(() => {
    if (view.phase !== "running") {
      world.current = { y: PLAY_HEIGHT / 2, velocity: 0, distance: 0, score: 0, level: 0, dead: false };
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
      gapCenter: 110 + random() * (PLAY_HEIGHT - 220),
      gapSize: 172 * difficulty,
      passed: false,
    }));

    const scene = new FlappyScene(view.seed);
    let frame = 0;
    let last = performance.now();
    let lastReport = 0;

    const kill = (state: typeof world.current) => {
      state.dead = true;
      scene.crash();
      haptic.notify("error");
      act("crash", { score: state.score });
    };

    const draw = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = world.current;
      state.level = levelRef.current;

      if (!state.dead) {
        const lift = Math.max(0, levelRef.current - 0.08) * LIFT;
        state.velocity += (GRAVITY - lift) * delta;
        state.velocity = Math.max(-MAX_FALL, Math.min(MAX_FALL, state.velocity));
        state.y += state.velocity * delta;
        state.distance += SPEED * delta;

        if (state.y < CEILING || state.y > FLOOR) {
          state.y = Math.max(CEILING, Math.min(FLOOR, state.y));
          kill(state);
        }
      }

      if (!state.dead) {
        for (const pipe of pipes) {
          const x = pipe.x - state.distance;
          if (x > WORLD_WIDTH) {
            break;
          }
          if (x < -PIPE_WIDTH) {
            continue;
          }
          const top = pipe.gapCenter - pipe.gapSize / 2;
          const bottom = pipe.gapCenter + pipe.gapSize / 2;
          const withinX = BIRD_X + BIRD_RADIUS > x && BIRD_X - BIRD_RADIUS < x + PIPE_WIDTH;
          if (withinX && (state.y - BIRD_RADIUS < top || state.y + BIRD_RADIUS > bottom)) {
            kill(state);
            break;
          }
          if (!pipe.passed && x + PIPE_WIDTH < BIRD_X) {
            pipe.passed = true;
            state.score += 1;
            setScore(state.score);
            haptic.impact("light");
          }
        }
      }

      context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      scene.render(context, state, pipes, delta);

      if (!state.dead && now - lastReport > 500) {
        lastReport = now;
        act("progress", { score: state.score, altitude: 1 - state.y / PLAY_HEIGHT });
      }

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [view.phase, view.seed, view.difficulty, act]);

  const nameOf = (userId: number) =>
    userId === profile?.id
      ? t("common.you")
      : (members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `P${userId}`);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <GameStatus
        eyebrow={t("games.board.voiceFlappy")}
        title={t("games.board.score", { value: score })}
        trailing={
          <span className="rounded-full bg-elevated px-3 py-1.5 font-display text-[12px] font-bold tabular">
            {t("games.board.alive", { count: view.alive.length })}
          </span>
        }
      />

      <div className="panel relative flex-1 overflow-hidden rounded-[20px]">
        <canvas ref={canvasRef} className="block size-full" />

        {view.phase === "countdown" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 veil px-8 text-center backdrop-blur-sm">
            <span className="font-display text-[56px] font-extrabold tracking-[-0.04em] tabular">
              {view.secondsLeft}
            </span>
            <p className="text-[13.5px] leading-snug text-secondary">
              {t("games.board.humToFly")}
            </p>
          </div>
        )}

        {view.phase === "finished" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 veil px-8 text-center backdrop-blur-sm">
            <span className="font-display text-[56px] font-extrabold tracking-[-0.04em] tabular">
              {view.scores[String(profile?.id ?? 0)] ?? score}
            </span>
            <p className="text-[13.5px] text-secondary">
              {view.winner === profile?.id
                ? t("games.board.youFlewFurthest")
                : t("games.board.wonThisRound", { name: nameOf(view.winner ?? 0) })}
            </p>
          </div>
        )}

        {view.phase === "running" && !view.youAlive && (
          <div className="absolute inset-0 flex items-center justify-center veil px-8 text-center backdrop-blur-sm">
            <p className="text-[13.5px] text-secondary">
              {t("games.board.youCrashed")}
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
            {t("games.board.allowMic")}
          </Button>
        )}
      </div>
    </div>
  );
};
