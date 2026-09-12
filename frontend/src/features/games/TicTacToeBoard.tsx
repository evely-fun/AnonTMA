import { m } from "motion/react";

import { spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { useSession } from "@/store/session";
import { useGames } from "@/store/games";

import { GameStatus, ScoreRow } from "./shared";

interface View {
  phase: string;
  board: string[];
  turn: number;
  yourMark: string;
  wins: Record<string, number>;
  round: number;
  bestOf: number;
  line: number[] | null;
  winner: number | null;
  withBot: boolean;
  secondsLeft: number;
}

export const TicTacToeBoard = ({ view }: { view: View }) => {
  const act = useGames((state) => state.act);
  const profile = useSession((state) => state.profile);
  const yourTurn = view.turn === profile?.id && view.phase === "playing";
  const yourWins = view.wins[String(profile?.id ?? 0)] ?? 0;
  const rivalWins = Object.entries(view.wins)
    .filter(([key]) => Number(key) !== profile?.id)
    .reduce((total, [, value]) => total + value, 0);

  return (
    <div className="flex flex-col gap-5">
      <GameStatus
        eyebrow={`Round ${view.round} of ${view.bestOf}`}
        title={
          view.phase === "finished"
            ? view.winner === profile?.id
              ? "You won the match"
              : view.winner
                ? "You lost the match"
                : "Draw"
            : yourTurn
              ? "Your move"
              : "Opponent is thinking"
        }
        seconds={view.phase === "playing" ? view.secondsLeft : undefined}
      />

      <ScoreRow
        items={[
          { value: yourWins, label: `you · ${view.yourMark ?? ""}`, tone: "accent" },
          { value: rivalWins, label: view.withBot ? "bot" : "rival" },
        ]}
      />

      <div className="mx-auto grid w-full max-w-[320px] grid-cols-3 gap-2">
        {view.board.map((cell, index) => {
          const winning = view.line?.includes(index) ?? false;
          return (
            <m.button
              key={index}
              type="button"
              disabled={Boolean(cell) || !yourTurn}
              onPointerDown={() => !cell && yourTurn && haptic.impact("medium")}
              onClick={() => act("move", { index })}
              whileTap={!cell && yourTurn ? { scale: 0.94 } : undefined}
              transition={spring.snappy}
              className={`flex aspect-square items-center justify-center rounded-[16px] font-display text-[34px] font-extrabold transition-colors ${
                winning ? "bg-accent-quiet" : "panel"
              } ${cell === "X" ? "text-accent" : "text-live"}`}
            >
              {cell && (
                <m.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={spring.ui}
                >
                  {cell}
                </m.span>
              )}
            </m.button>
          );
        })}
      </div>
    </div>
  );
};
