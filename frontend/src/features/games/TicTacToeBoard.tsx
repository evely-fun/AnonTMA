import { motion } from "framer-motion";

import { spring } from "@/shared/lib/motion";
import { useGames } from "@/store/games";
import { useSession } from "@/store/session";

import styles from "./games.module.css";

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
    <div className={styles.stage}>
      <div className={styles.statusBar}>
        <div>
          <span className={styles.phase}>
            Round {view.round} of {view.bestOf}
          </span>
          <span className={styles.phaseValue}>
            {view.phase === "finished"
              ? view.winner === profile?.id
                ? "You won"
                : view.winner
                  ? "You lost"
                  : "Draw"
              : yourTurn
                ? "Your move"
                : "Opponent thinking"}
          </span>
        </div>
        {view.phase === "playing" ? (
          <span className={styles.countdown}>⏱ {view.secondsLeft}</span>
        ) : null}
      </div>

      <div className={styles.scoreRow}>
        <div className={styles.scoreItem}>
          <span className={styles.scoreValue}>{yourWins}</span>
          <span className={styles.scoreLabel}>you ({view.yourMark})</span>
        </div>
        <div className={styles.scoreItem}>
          <span className={styles.scoreValue}>{rivalWins}</span>
          <span className={styles.scoreLabel}>{view.withBot ? "bot" : "rival"}</span>
        </div>
      </div>

      <div className={styles.board}>
        {view.board.map((cell, index) => {
          const winning = view.line?.includes(index) ?? false;
          return (
            <motion.button
              key={index}
              type="button"
              className={[
                styles.cell,
                cell === "X" ? styles.cellX : cell === "O" ? styles.cellO : "",
                winning ? styles.cellWin : "",
              ]
                .filter(Boolean)
                .join(" ")}
              whileTap={!cell && yourTurn ? { scale: 0.94 } : undefined}
              transition={spring}
              disabled={Boolean(cell) || !yourTurn}
              onClick={() => act("move", { index })}
            >
              {cell ? (
                <motion.span
                  initial={{ scale: 0.4, opacity: 0, rotate: -18 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={spring}
                >
                  {cell}
                </motion.span>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
