import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { useT } from "@/shared/i18n";
import { rise } from "@/shared/lib/motion";
import { Avatar, Button, Chip, IconTile } from "@/shared/ui";
import { EyeIcon, GhostIcon, ProfileIcon, ShieldIcon } from "@/shared/ui/icons";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";

import { GameStatus } from "./shared";

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
  winner: string | null;
  secondsLeft: number;
  canAct: boolean;
}

const ROLE_ICONS: Record<string, typeof GhostIcon> = {
  mafia: GhostIcon,
  doctor: ShieldIcon,
  detective: EyeIcon,
  civilian: ProfileIcon,
};

const PHASE_KEYS: Record<string, string> = {
  night: "night",
  reveal: "morning",
  discussion: "discussion",
  vote: "vote",
  finished: "gameOver",
};

export const MafiaBoard = ({ view }: { view: View }) => {
  const { t } = useT();
  const act = useGames((state) => state.act);
  const profile = useSession((state) => state.profile);
  const members = useRooms((state) => state.members);
  const [selected, setSelected] = useState<number | null>(null);

  const roleKey = view.yourRole ?? "civilian";
  const RoleIcon = ROLE_ICONS[roleKey] ?? ProfileIcon;
  const nameOf = (userId: number) =>
    userId === profile?.id
      ? t("common.you")
      : (members.find((item) => item.userId === userId)?.anonName.split(" ").slice(0, 2).join(" ") ??
        `#${userId}`);
  const seedOf = (userId: number) =>
    members.find((item) => item.userId === userId)?.avatarSeed ?? String(userId);

  const canPick = view.canAct && view.youAlive && !(view.phase === "night" && view.nightLocked);

  return (
    <div className="flex flex-col gap-4">
      <GameStatus
        eyebrow={t("games.board.day", { day: view.day })}
        title={t(`games.board.${PHASE_KEYS[view.phase] ?? "discussion"}`)}
        seconds={view.secondsLeft}
      />

      <div className="panel flex items-center gap-3.5 rounded-[18px] px-4 py-4">
        <IconTile tone={roleKey === "mafia" ? "danger" : "accent"} size={44}>
          <RoleIcon size={21} />
        </IconTile>
        <div className="min-w-0">
          <p className="font-display text-[16px] font-extrabold tracking-[-0.02em]">
            {view.phase === "finished"
              ? view.winner === "mafia"
                ? t("games.board.mafiaWins")
                : t("games.board.townWins")
              : t(`games.board.roles.${roleKey}.name`)}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-hint">
            {view.youAlive
              ? t(`games.board.roles.${roleKey}.hint`)
              : t("games.board.youAreOut")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {view.players.map((userId) => {
            const alive = view.alive.includes(userId);
            const checked = view.checks[String(userId)];
            const roleTag = view.visibleRoles[String(userId)];
            const votes = Object.values(view.votes).filter((target) => target === userId).length;
            return (
              <m.button
                key={userId}
                type="button"
                variants={rise}
                initial="initial"
                animate="animate"
                exit="exit"
                disabled={!canPick || !alive || userId === profile?.id}
                onClick={() => setSelected(userId)}
                className={`flex items-center gap-3 rounded-[16px] px-3.5 py-3 text-left transition-colors ${
                  selected === userId ? "bg-accent-quiet" : "panel"
                } ${alive ? "" : "opacity-40 grayscale"}`}
              >
                <Avatar seed={seedOf(userId)} size={36} />
                <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold">
                  {nameOf(userId)}
                </span>
                {checked !== undefined && (
                  <Chip tone={checked ? "danger" : "live"}>
                    {checked ? t("games.board.mafiaTag") : t("games.board.cleanTag")}
                  </Chip>
                )}
                {roleTag && userId !== profile?.id && (
                  <Chip tone="danger">{t(`games.board.roles.${roleTag}.name`)}</Chip>
                )}
                {votes > 0 && (
                  <span className="font-display text-[12px] font-bold text-hint tabular">
                    {votes}
                  </span>
                )}
              </m.button>
            );
          })}
        </AnimatePresence>
      </div>

      {view.phase !== "finished" && (
        <div>
          {view.phase === "discussion" ? (
            <Button full variant="surface" onClick={() => act("skip_phase", {})}>
              {t("games.board.readyToVote")}
            </Button>
          ) : (
            <Button
              full
              disabled={selected === null || !canPick}
              onClick={() => {
                if (selected === null) return;
                act(view.phase === "vote" ? "vote" : "night_action", { target: selected });
                setSelected(null);
              }}
            >
              {view.phase === "vote"
                ? t("games.board.castVote")
                : view.nightLocked
                  ? t("games.board.choiceLocked")
                  : t("games.board.confirmChoice")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
