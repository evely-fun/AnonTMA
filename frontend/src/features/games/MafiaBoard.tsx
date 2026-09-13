import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { useT } from "@/shared/i18n";
import { rise } from "@/shared/lib/motion";
import { Avatar, Button, Chip, IconTile } from "@/shared/ui";
import { EyeIcon, GhostIcon, ProfileIcon, ShieldIcon, StarIcon } from "@/shared/ui/icons";
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
  donChecks: Record<string, boolean>;
  runoff: number[];
  lastHeal: number | null;
  selfHealUsed: boolean;
  votes: Record<string, number>;
  nightLocked: boolean;
  winner: string | null;
  secondsLeft: number;
  canAct: boolean;
}

const ROLE_ICONS: Record<string, typeof GhostIcon> = {
  mafia: GhostIcon,
  don: GhostIcon,
  doctor: ShieldIcon,
  sheriff: EyeIcon,
  civilian: ProfileIcon,
};

const PHASE_KEYS: Record<string, string> = {
  intro: "introTitle",
  night: "night",
  reveal: "morning",
  discussion: "discussion",
  vote: "vote",
  finished: "gameOver",
};

const MAFIA_ROLES = ["mafia", "don"];

export const MafiaBoard = ({ view }: { view: View }) => {
  const { t } = useT();
  const act = useGames((state) => state.act);
  const profile = useSession((state) => state.profile);
  const members = useRooms((state) => state.members);
  const [selected, setSelected] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [assign, setAssign] = useState<"victim" | "check">("victim");

  const roleKey = view.yourRole ?? "civilian";
  const RoleIcon = ROLE_ICONS[roleKey] ?? ProfileIcon;
  const nameOf = (userId: number) =>
    userId === profile?.id
      ? t("common.you")
      : (members.find((item) => item.userId === userId)?.anonName.split(" ").slice(0, 2).join(" ") ??
        `#${userId}`);
  const seedOf = (userId: number) =>
    members.find((item) => item.userId === userId)?.avatarSeed ?? String(userId);

  const isNight = view.phase === "night";
  const isVote = view.phase === "vote";
  const canPick = view.canAct && view.youAlive && !(isNight && view.nightLocked);
  // The don splits their night in two: who dies, and who they read for the
  // star. Everything else only ever points at one person.
  const donSplit = isNight && roleKey === "don" && canPick;

  /** Whether this player is a legal target for whatever you are doing now. */
  const targetable = (userId: number) => {
    if (!canPick) return false;
    if (!view.alive.includes(userId)) return false;
    if (isVote) return view.runoff.length === 0 || view.runoff.includes(userId);
    if (donSplit && assign === "check") return userId !== profile?.id;
    if (roleKey === "doctor") {
      if (userId === profile?.id) return !view.selfHealUsed;
      return userId !== view.lastHeal;
    }
    if (MAFIA_ROLES.includes(roleKey)) {
      return !MAFIA_ROLES.includes(view.visibleRoles[String(userId)] ?? "");
    }
    return userId !== profile?.id;
  };

  const pick = (userId: number) => {
    if (donSplit && assign === "check") setInspect(userId);
    else setSelected(userId);
  };

  const confirm = () => {
    if (isVote) {
      if (selected === null) return;
      act("vote", { target: selected });
    } else {
      if (selected === null) return;
      act("night_action", inspect === null ? { target: selected } : { target: selected, inspect });
    }
    setSelected(null);
    setInspect(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <GameStatus
        eyebrow={t("games.board.day", { day: view.day })}
        title={t(`games.board.${PHASE_KEYS[view.phase] ?? "discussion"}`)}
        seconds={view.secondsLeft}
      />

      <div className="panel flex items-center gap-3.5 rounded-[18px] px-4 py-4">
        <IconTile tone={MAFIA_ROLES.includes(roleKey) ? "danger" : "accent"} size={44}>
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
            {!view.youAlive
              ? t("games.board.youAreOut")
              : view.phase === "intro"
                ? t("games.board.introHint")
                : t(`games.board.roles.${roleKey}.hint`)}
          </p>
        </div>
      </div>

      {isVote && view.runoff.length > 0 && (
        <div className="flex items-center justify-center gap-2">
          <Chip tone="danger">{t("games.board.runoffTitle")}</Chip>
          {view.runoff.map((userId) => (
            <Chip key={userId}>{nameOf(userId)}</Chip>
          ))}
        </div>
      )}

      {donSplit && (
        <div className="flex rounded-full bg-elevated p-1">
          {(["victim", "check"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAssign(mode)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                assign === mode ? "bg-accent text-on-accent" : "text-hint"
              }`}
            >
              {t(`games.board.assign.${mode}`)}
            </button>
          ))}
        </div>
      )}

      {/* A table rather than a queue. Everyone is visible at once, which is the
          whole point of a game about reading the room, and a stack of full
          width cards can only ever show four of them. */}
      <div className="grid grid-cols-3 gap-2">
        <AnimatePresence initial={false}>
          {view.players.map((userId) => {
            const alive = view.alive.includes(userId);
            const checked = view.checks[String(userId)];
            const starred = view.donChecks[String(userId)];
            const roleTag = view.visibleRoles[String(userId)];
            const votes = Object.values(view.votes).filter((target) => target === userId).length;
            const picked = selected === userId || inspect === userId;
            return (
              <m.button
                key={userId}
                type="button"
                variants={rise}
                initial="initial"
                animate="animate"
                exit="exit"
                disabled={!targetable(userId)}
                onClick={() => pick(userId)}
                className={`relative flex flex-col items-center gap-1.5 rounded-[18px] px-2 py-3 transition-colors ${
                  picked ? "bg-accent-quiet" : "panel"
                } ${alive ? "" : "opacity-40 grayscale"}`}
              >
                <Avatar seed={seedOf(userId)} size={46} />
                <span className="w-full truncate text-center text-[12px] font-semibold">
                  {nameOf(userId)}
                </span>

                {votes > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-elevated font-display text-[11px] font-extrabold tabular">
                    {votes}
                  </span>
                )}
                {inspect === userId && (
                  <span className="absolute left-1.5 top-1.5 text-accent">
                    <StarIcon size={14} />
                  </span>
                )}
                {checked !== undefined && (
                  <Chip tone={checked ? "danger" : "live"}>
                    {checked ? t("games.board.mafiaTag") : t("games.board.cleanTag")}
                  </Chip>
                )}
                {starred !== undefined && (
                  <Chip tone={starred ? "danger" : "live"}>
                    {starred ? t("games.board.starTag") : t("games.board.noStarTag")}
                  </Chip>
                )}
                {roleTag && userId !== profile?.id && (
                  <Chip tone="danger">{t(`games.board.roles.${roleTag}.name`)}</Chip>
                )}
                {userId === view.lastHeal && roleKey === "doctor" && (
                  <Chip>{t("games.board.healedLast")}</Chip>
                )}
              </m.button>
            );
          })}
        </AnimatePresence>
      </div>

      {view.phase === "intro" && view.youAlive && (
        <Button full variant="surface" onClick={() => act("skip_phase", {})}>
          {t("games.board.readyForNight")}
        </Button>
      )}

      {view.phase === "discussion" && view.youAlive && (
        <Button full variant="surface" onClick={() => act("skip_phase", {})}>
          {t("games.board.readyToVote")}
        </Button>
      )}

      {(isNight || isVote) && view.youAlive && (
        <Button full disabled={selected === null || !canPick} onClick={confirm}>
          {isVote
            ? t("games.board.castVote")
            : view.nightLocked
              ? t("games.board.choiceLocked")
              : t("games.board.confirmChoice")}
        </Button>
      )}
    </div>
  );
};
