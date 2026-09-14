import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { useT } from "@/shared/i18n";
import { rise } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { Avatar, Button, Chip, Sheet } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";

import { PhaseBanner, RoleCard } from "./art";

interface SeatView {
  userId: number;
  alive: boolean;
  fouls: number;
  warnings: number;
  muted: boolean;
}

interface View {
  phase: string;
  day: number;
  isHost: boolean;
  yourSeat: number;
  yourRole: string | null;
  youAlive: boolean;
  seats: Record<string, SeatView>;
  visibleRoles: Record<string, string>;
  speaker: number | null;
  youSpeak: boolean;
  canNominate: boolean;
  nominations: Record<string, number>;
  candidates: number[];
  tabledTie: number[];
  votes: Record<string, number | string>;
  checks: Record<string, boolean>;
  lastHeal: number | null;
  selfHealUsed: boolean;
  nightLocked: boolean;
  teamPicks: Record<string, number>;
  winner: string | null;
  secondsLeft: number;
  canAct: boolean;
}

const BLACK = ["mafia", "don"];

export const CityMafiaBoard = ({ view }: { view: View }) => {
  const { t } = useT();
  const act = useGames((state) => state.act);
  const members = useRooms((state) => state.members);
  const [picked, setPicked] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [assign, setAssign] = useState<"victim" | "check">("victim");
  const [panel, setPanel] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  const order = Object.keys(view.seats)
    .map(Number)
    .sort((a, b) => a - b);
  const seatOf = (seat: number) => view.seats[String(seat)];
  const seedOf = (seat: number) => {
    const entry = seatOf(seat);
    return (
      members.find((item) => item.userId === entry?.userId)?.avatarSeed ?? String(entry?.userId ?? seat)
    );
  };

  const roleKey = view.yourRole ?? "civilian";
  const isNight = view.phase === "night" || view.phase === "first_night";
  const isVote = view.phase === "vote";
  const isTableVote = view.phase === "table_vote";
  const donSplit = isNight && roleKey === "don" && !view.nightLocked;

  const headline = (() => {
    switch (view.phase) {
      case "first_night":
        return t("games.board.citymafia.firstNight");
      case "speech":
        return view.youSpeak
          ? t("games.board.citymafia.yourSpeech")
          : t("games.board.citymafia.speechOf", { seat: view.speaker ?? 0 });
      case "defence":
        return t("games.board.citymafia.defenceOf", { seat: view.speaker ?? 0 });
      case "last_word":
        return t("games.board.citymafia.lastWordOf", { seat: view.speaker ?? 0 });
      case "vote":
        return t("games.board.citymafia.voteNow");
      case "table_vote":
        return t("games.board.citymafia.tableVote");
      case "night":
        return t("games.board.citymafia.nightFalls");
      case "reveal":
        return t("games.board.citymafia.morning");
      case "finished":
        return view.winner === "mafia"
          ? t("games.board.citymafia.mafiaWins")
          : view.winner === "draw"
            ? t("games.board.citymafia.drawEnded")
            : t("games.board.citymafia.townWins");
      default:
        return t("games.board.day", { day: view.day });
    }
  })();

  /** Whether tapping this seat means anything right now. */
  const selectable = (seat: number) => {
    const entry = seatOf(seat);
    if (!entry?.alive) return false;
    if (view.isHost) return true;
    if (isVote) return view.candidates.includes(seat);
    if (view.canNominate) return seat !== view.yourSeat;
    if (isNight && view.canAct && !view.nightLocked) {
      if (donSplit && assign === "check") return seat !== view.yourSeat;
      if (roleKey === "doctor") {
        if (seat === view.yourSeat) return !view.selfHealUsed;
        return seat !== view.lastHeal;
      }
      if (BLACK.includes(roleKey)) return !BLACK.includes(view.visibleRoles[String(seat)] ?? "");
      if (roleKey === "sheriff") return seat !== view.yourSeat;
    }
    return false;
  };

  const tap = (seat: number) => {
    haptic.select();
    if (donSplit && assign === "check") setInspect(seat);
    else setPicked(seat);
  };

  const confirm = () => {
    if (picked === null) return;
    if (isVote) act("vote", { seat: picked });
    else if (view.canNominate) act("nominate", { seat: picked });
    else act("night_action", inspect === null ? { seat: picked } : { seat: picked, inspect });
    setPicked(null);
    setInspect(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <PhaseBanner
        phase={view.phase}
        eyebrow={
          view.isHost
            ? t("games.board.citymafia.host")
            : t("games.board.citymafia.yourSeat", { seat: view.yourSeat })
        }
        title={headline}
        seconds={view.secondsLeft}
      />

      {!view.isHost && (
        <RoleCard
          role={roleKey}
          seat={view.yourSeat}
          title={t(`games.board.citymafia.roles.${roleKey}.name`)}
          hint={
            view.youAlive
              ? t(`games.board.citymafia.roles.${roleKey}.hint`)
              : t("games.board.youAreOut")
          }
        />
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
              {t(`games.board.citymafia.pick${mode === "victim" ? "Victim" : "Check"}`)}
            </button>
          ))}
        </div>
      )}

      {/* Ten numbered seats. A club table is read by number, so the number is
          the loudest thing on the card and the face only supports it. */}
      <div className="grid grid-cols-5 gap-1.5">
        <AnimatePresence initial={false}>
          {order.map((seat) => {
            const entry = seatOf(seat);
            const role = view.visibleRoles[String(seat)];
            const check = view.checks[String(seat)];
            const votes = Object.values(view.votes).filter((value) => value === seat).length;
            const teamPick = Object.values(view.teamPicks).includes(seat);
            const chosen = picked === seat;
            return (
              <m.button
                key={seat}
                type="button"
                variants={rise}
                initial="initial"
                animate="animate"
                exit="exit"
                disabled={!selectable(seat)}
                onClick={() => tap(seat)}
                className={`relative flex flex-col items-center gap-1 rounded-[14px] px-1 py-2 transition-colors ${
                  chosen ? "bg-accent-quiet" : "panel"
                } ${entry?.alive ? "" : "opacity-40 grayscale"}`}
              >
                <span className="relative">
                  <Avatar seed={seedOf(seat)} size={34} />
                  {(inspect === seat || teamPick) && (
                    <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-destructive" />
                  )}
                </span>
                <span className="font-display text-[13px] font-extrabold tabular">{seat}</span>

                {votes > 0 && (
                  <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-elevated font-display text-[10px] font-extrabold tabular">
                    {votes}
                  </span>
                )}
                {view.candidates.includes(seat) && (
                  <span className="absolute inset-x-1 bottom-1 h-0.5 rounded-full bg-accent" />
                )}
                {check !== undefined && (
                  <Chip tone={check ? "danger" : "live"}>
                    {check ? t("games.board.mafiaTag") : t("games.board.cleanTag")}
                  </Chip>
                )}
                {role && seat !== view.yourSeat && (
                  <Chip tone={BLACK.includes(role) ? "danger" : "live"}>
                    {t(`games.board.citymafia.roles.${role}.name`)}
                  </Chip>
                )}
                {entry && (entry.fouls > 0 || entry.warnings > 0) && (
                  <span className="text-[10px] text-hint tabular">
                    {entry.fouls > 0 && `Ф${entry.fouls}`}
                    {entry.warnings > 0 && ` П${entry.warnings}`}
                  </span>
                )}
              </m.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Player controls. Only the one thing you can do right now is shown. */}
      {!view.isHost && (
        <div className="flex flex-col gap-2">
          {view.canNominate && (
            <Button full disabled={picked === null} onClick={confirm}>
              {t("games.board.citymafia.nominate")}
            </Button>
          )}
          {view.phase === "speech" && view.youSpeak && (
            <Button full variant="surface" onClick={() => act("done_speaking", {})}>
              {t("games.board.citymafia.donePass")}
            </Button>
          )}
          {(view.phase === "defence" || view.phase === "last_word") &&
            view.speaker === view.yourSeat && (
              <Button full variant="surface" onClick={() => act("done_speaking", {})}>
                {t("games.board.citymafia.donePass")}
              </Button>
            )}
          {isVote && view.canAct && (
            <Button full disabled={picked === null} onClick={confirm}>
              {t("games.board.citymafia.castVote")}
            </Button>
          )}
          {isTableVote && !view.tabledTie.includes(view.yourSeat) && view.youAlive && (
            <>
              <p className="text-center text-[12.5px] text-hint">
                {t("games.board.citymafia.tableVoteHint")}
              </p>
              <div className="flex gap-2">
                <Button full variant="surface" onClick={() => act("vote", { all: false })}>
                  {t("games.board.citymafia.keepAll")}
                </Button>
                <Button full onClick={() => act("vote", { all: true })}>
                  {t("games.board.citymafia.liftAll")}
                </Button>
              </div>
            </>
          )}
          {isNight && view.canAct && (
            <Button full disabled={picked === null || view.nightLocked} onClick={confirm}>
              {view.nightLocked
                ? t("games.board.citymafia.choiceLocked")
                : t("games.board.citymafia.confirmChoice")}
            </Button>
          )}
          {(roleKey === "sheriff" || roleKey === "doctor") && view.youAlive && (
            <Button full variant="quiet" onClick={() => setNoteOpen(true)}>
              {t("games.board.citymafia.noteHost")}
            </Button>
          )}
        </div>
      )}

      {view.isHost && view.phase !== "finished" && (
        <div className="flex gap-2">
          <Button full variant="surface" onClick={() => act("next_phase", {})}>
            {t("games.board.citymafia.closePhase")}
          </Button>
          <Button full onClick={() => setPanel(true)}>
            {t("games.board.citymafia.hostPanel")}
          </Button>
        </div>
      )}

      <Sheet
        open={panel}
        onClose={() => setPanel(false)}
        title={t("games.board.citymafia.hostPanel")}
      >
        <div className="space-y-2 pb-2">
          {order.map((seat) => {
            const entry = seatOf(seat);
            return (
              <div key={seat} className="flex items-center gap-2">
                <span className="w-7 shrink-0 font-display text-[14px] font-extrabold tabular">
                  {seat}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-hint tabular">
                  {t("games.board.citymafia.fouls", { count: entry?.fouls ?? 0 })} ·{" "}
                  {t("games.board.citymafia.warnings", { count: entry?.warnings ?? 0 })}
                  {entry?.muted && ` · ${t("games.board.citymafia.muted")}`}
                </span>
                {entry?.alive ? (
                  <>
                    <button
                      type="button"
                      onClick={() => act("foul", { seat })}
                      className="rounded-full bg-elevated px-3 py-1.5 text-[12px] font-semibold"
                    >
                      {t("games.board.citymafia.foul")}
                    </button>
                    <button
                      type="button"
                      onClick={() => act("warn", { seat })}
                      className="rounded-full bg-destructive-quiet px-3 py-1.5 text-[12px] font-semibold text-destructive"
                    >
                      {t("games.board.citymafia.warning")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => act("restore", { seat })}
                    className="rounded-full bg-elevated px-3 py-1.5 text-[12px] font-semibold"
                  >
                    {t("games.board.citymafia.restore")}
                  </button>
                )}
              </div>
            );
          })}
          <Button full variant="surface" onClick={() => act("end_game", {})}>
            {t("games.board.citymafia.endGame")}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title={t("games.board.citymafia.noteHost")}
      >
        <div className="space-y-3 pb-2">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 200))}
            placeholder={t("games.board.citymafia.notePlaceholder")}
            rows={3}
            className="w-full resize-none rounded-[16px] bg-elevated px-4 py-3 text-[14px] outline-none"
          />
          <Button
            full
            disabled={note.trim().length === 0}
            onClick={() => {
              act("note_host", { text: note.trim() });
              setNote("");
              setNoteOpen(false);
            }}
          >
            {t("games.board.citymafia.send")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
};
