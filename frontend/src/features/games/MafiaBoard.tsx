import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { itemVariants } from "@/shared/lib/motion";
import { Avatar, Button, Chip } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";

import styles from "./games.module.css";

interface View {
  phase: string;
  day: number;
  players: number[];
  alive: number[];
  yourRole: string | null;
  youAlive: boolean;
  visibleRoles: Record<string, string>;
  checks: Record<string, boolean>;
  votes: Record<string, number>;
  nightLocked: boolean;
  log: { day: number; text: string; user?: number }[];
  winner: string | null;
  secondsLeft: number;
  canAct: boolean;
}

const ROLE_INFO: Record<string, { icon: string; name: string; hint: string }> = {
  mafia: { icon: "🔪", name: "Mafia", hint: "Choose a victim each night, stay invisible by day." },
  doctor: { icon: "🩺", name: "Doctor", hint: "Save one person every night, you may save yourself once." },
  detective: { icon: "🔍", name: "Detective", hint: "Check one player per night and learn their side." },
  civilian: { icon: "👤", name: "Civilian", hint: "You have only your voice and your logic." },
};

const PHASE_LABEL: Record<string, string> = {
  night: "Night falls",
  reveal: "Morning report",
  discussion: "Open discussion",
  vote: "Time to vote",
  finished: "Game over",
};

export const MafiaBoard = ({ view }: { view: View }) => {
  const act = useGames((state) => state.act);
  const profile = useSession((state) => state.profile);
  const members = useRooms((state) => state.members);
  const [selected, setSelected] = useState<number | null>(null);

  const role = ROLE_INFO[view.yourRole ?? "civilian"];
  const nameOf = (userId: number): string => {
    if (userId === profile?.id) {
      return "You";
    }
    const member = members.find((item) => item.userId === userId);
    return member?.anonName.split(" ").slice(0, 2).join(" ") ?? `Player ${userId}`;
  };
  const seedOf = (userId: number): string =>
    members.find((item) => item.userId === userId)?.avatarSeed ?? String(userId);

  const canPick = view.canAct && view.youAlive && !(view.phase === "night" && view.nightLocked);

  const confirm = (): void => {
    if (selected === null) {
      return;
    }
    act(view.phase === "vote" ? "vote" : "night_action", { target: selected });
    setSelected(null);
  };

  return (
    <div className={styles.stage}>
      <div className={styles.statusBar}>
        <div>
          <span className={styles.phase}>Day {view.day}</span>
          <span className={styles.phaseValue}>{PHASE_LABEL[view.phase] ?? view.phase}</span>
        </div>
        {view.secondsLeft > 0 ? <span className={styles.countdown}>⏱ {view.secondsLeft}</span> : null}
      </div>

      {view.phase === "finished" ? (
        <div className={styles.roleCard}>
          <span className={styles.roleIcon}>{view.winner === "mafia" ? "🔪" : "🏛"}</span>
          <div>
            <p className={styles.roleName}>{view.winner === "mafia" ? "Mafia wins" : "Town wins"}</p>
            <p className={styles.roleHint}>
              {Object.entries(view.visibleRoles)
                .map(([id, value]) => `${nameOf(Number(id))} · ${ROLE_INFO[value]?.name ?? value}`)
                .join(", ")}
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.roleCard}>
          <span className={styles.roleIcon}>{role.icon}</span>
          <div>
            <p className={styles.roleName}>{role.name}</p>
            <p className={styles.roleHint}>{view.youAlive ? role.hint : "You are out, watch quietly."}</p>
          </div>
        </div>
      )}

      <div className={styles.playerList}>
        <AnimatePresence initial={false}>
          {view.players.map((userId) => {
            const alive = view.alive.includes(userId);
            const checked = view.checks[String(userId)];
            const roleTag = view.visibleRoles[String(userId)];
            const votes = Object.values(view.votes).filter((target) => target === userId).length;
            return (
              <motion.button
                key={userId}
                type="button"
                variants={itemVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                disabled={!canPick || !alive || userId === profile?.id}
                className={[
                  styles.playerRow,
                  selected === userId ? styles.playerSelected : "",
                  alive ? "" : styles.playerDead,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelected(userId)}
              >
                <Avatar seed={seedOf(userId)} size={38} />
                <span className={styles.playerName}>{nameOf(userId)}</span>
                {checked !== undefined ? (
                  <Chip size="sm" tone={checked ? "danger" : "mint"}>
                    {checked ? "mafia" : "clean"}
                  </Chip>
                ) : null}
                {roleTag && userId !== profile?.id ? (
                  <Chip size="sm" tone="danger">
                    {ROLE_INFO[roleTag]?.name ?? roleTag}
                  </Chip>
                ) : null}
                {votes > 0 ? <span className={styles.playerTag}>{votes} votes</span> : null}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {view.phase !== "finished" ? (
        <div className={styles.actions}>
          {view.phase === "discussion" ? (
            <Button full variant="secondary" onClick={() => act("skip_phase", {})}>
              Ready to vote
            </Button>
          ) : (
            <Button full disabled={selected === null || !canPick} onClick={confirm}>
              {view.phase === "vote" ? "Vote" : view.nightLocked ? "Choice locked" : "Confirm choice"}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
};
