import { m } from "motion/react";

import { useT } from "@/shared/i18n";
import { spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { useSession } from "@/store/session";
import { useGames } from "@/store/games";

import { Versus } from "./shared";

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
  const { t } = useT();
  const act = useGames((state) => state.act);
  const profile = useSession((state) => state.profile);
  const yourTurn = view.turn === profile?.id && view.phase === "playing";
  const playing = view.phase === "playing";
  const yourWins = view.wins[String(profile?.id ?? 0)] ?? 0;
  const rivalWins = Object.entries(view.wins)
    .filter(([key]) => Number(key) !== profile?.id)
    .reduce((total, [, value]) => total + value, 0);

  const headline =
    view.phase === "finished"
      ? view.winner === profile?.id
        ? t("games.board.youWon")
        : view.winner
          ? t("games.board.youLost")
          : t("games.board.draw")
      : yourTurn
        ? t("games.board.yourMove")
        : t("games.board.opponentThinking");

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-2">
      {/* Two players facing each other across a round counter, rather than two
          loose numbers over a status card that repeats the same thing. */}
      <Versus
        left={{
          name: t("common.you"),
          badge: <span className={view.yourMark === "X" ? "text-accent" : "text-live"}>{view.yourMark}</span>,
          score: yourWins,
          active: yourTurn && playing,
        }}
        right={{
          name: view.withBot ? t("games.board.bot") : t("games.board.rival"),
          badge: (
            <span className={view.yourMark === "X" ? "text-live" : "text-accent"}>
              {view.yourMark === "X" ? "O" : "X"}
            </span>
          ),
          score: rivalWins,
          active: !yourTurn && playing,
        }}
        middleLabel={t("games.board.round", { current: view.round, total: view.bestOf })}
        middleValue={playing && view.secondsLeft > 0 ? view.secondsLeft : undefined}
      />

      <p className="text-center font-display text-[17px] font-extrabold tracking-[-0.02em]">
        {headline}
      </p>

      {/* One board with its grid cut into it. Nine separate floating cards read
          as nine buttons that happen to sit near each other. */}
      <div className="mx-auto w-full max-w-[344px]">
        <div className="grid grid-cols-3 gap-[3px] overflow-hidden rounded-[24px] bg-bezel">
          {view.board.map((cell, index) => {
            const winning = view.line?.includes(index) ?? false;
            const open = !cell && yourTurn;
            return (
              <m.button
                key={index}
                type="button"
                disabled={!open}
                onPointerDown={() => open && haptic.impact("medium")}
                onClick={() => act("move", { index })}
                whileTap={open ? { scale: 0.93 } : undefined}
                transition={spring.snappy}
                // The winning line lights up in the winner's own colour, not
                // always the app accent, so a green three in a row does not
                // get painted over in red.
                className={`flex aspect-square items-center justify-center font-display text-[38px] font-extrabold transition-colors ${
                  winning
                    ? cell === "X"
                      ? "bg-accent-quiet"
                      : "bg-live-quiet"
                    : "bg-surface"
                } ${cell === "X" ? "text-accent" : "text-live"}`}
              >
                {cell && (
                  <m.span
                    initial={{ scale: 0.4, opacity: 0 }}
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
    </div>
  );
};
