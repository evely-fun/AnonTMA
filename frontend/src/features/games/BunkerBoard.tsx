import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { useT } from "@/shared/i18n";
import { rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { Avatar, Button, Chip, Panel, Sheet } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";

import { Countdown } from "./shared";

type Card = Record<string, unknown>;

interface View {
  phase: string;
  round: number;
  players: number[];
  alive: number[];
  places: number;
  catastrophe: string;
  shelter: { fault: string; years: number; area: number; rooms: string[] };
  speaker: number | null;
  youSpeak: boolean;
  opened: Record<string, Record<string, Card>>;
  yourDossier: Record<string, Card>;
  yourCards: string[];
  votes: Record<string, number>;
  runoff: number[];
  accused: number | null;
  youAlive: boolean;
  canVote: boolean;
  winner: string | null;
  epilogue: { outcome: string } | null;
  secondsLeft: number;
}

const FIELDS = ["profession", "biology", "health", "hobby", "luggage", "fact"] as const;

/** A card's value written out, because the shapes differ per field. */
const describe = (field: string, card: Card | undefined): string => {
  if (!card) return "—";
  if (field === "biology") {
    const sex = String(card.sex ?? "");
    return `${sex === "female" ? "♀" : "♂"} ${card.age}`;
  }
  const value = String(card.value ?? "");
  const years = card.years ? ` · ${card.years}` : "";
  return `${value.replace(/_/g, " ")}${years}`;
};

export const BunkerBoard = ({ view }: { view: View }) => {
  const { t } = useT();
  const act = useGames((state) => state.act);
  const members = useRooms((state) => state.members);
  const profile = useSession((state) => state.profile);
  const [dossier, setDossier] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const nameOf = (userId: number | null) => {
    if (userId === null) return "—";
    if (userId === profile?.id) return t("common.you");
    return (
      members.find((item) => item.userId === userId)?.anonName.split(" ").slice(0, 2).join(" ") ??
      `#${userId}`
    );
  };
  const seedOf = (userId: number) =>
    members.find((item) => item.userId === userId)?.avatarSeed ?? String(userId);

  const headline =
    view.phase === "finished"
      ? t(`games.board.bunker.outcome.${view.epilogue?.outcome ?? "survive"}`)
      : view.phase === "speech"
        ? view.youSpeak
          ? t("games.board.bunker.yourTurn")
          : t("games.board.bunker.speaking", { name: nameOf(view.speaker) })
        : view.phase === "debate"
          ? t("games.board.bunker.debate")
          : view.phase === "vote"
            ? view.runoff.length > 0
              ? t("games.board.bunker.runoff")
              : t("games.board.bunker.voteNow")
            : view.phase === "last_word"
              ? t("games.board.bunker.accused", { name: nameOf(view.accused) })
              : t("games.board.bunker.debate");

  return (
    <div className="flex flex-col gap-4">
      {/* What you are all arguing about sits at the top and never moves: the
          catastrophe and the thing that broke are what decide whose cards are
          worth anything. */}
      <Panel className="mx-0 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-extrabold tracking-[-0.02em]">
              {t(`games.board.bunker.catastrophe.${view.catastrophe}`)}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-hint">
              {t(`games.board.bunker.fault.${view.shelter.fault}`)}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-elevated px-2.5 py-1 text-[12px] font-semibold tabular">
            {t("games.board.bunker.places", { count: view.places })}
          </span>
        </div>
      </Panel>

      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[12px] text-hint">
            {t("games.board.bunker.round", { current: view.round })} ·{" "}
            {t(`games.board.bunker.rounds.${Math.min(view.round, 3)}`)}
          </span>
          <span className="mt-0.5 block truncate font-display text-[16px] font-extrabold tracking-[-0.02em]">
            {headline}
          </span>
        </span>
        {view.secondsLeft > 0 && <Countdown seconds={view.secondsLeft} />}
      </div>

      {/* Everyone at the table, with whatever they have opened so far under
          their face. This is the board: you read people, not a list. */}
      <div className="grid grid-cols-2 gap-2">
        <AnimatePresence initial={false}>
          {view.players.map((userId) => {
            const alive = view.alive.includes(userId);
            const shown = view.opened[String(userId)] ?? {};
            const votes = Object.values(view.votes).filter((target) => target === userId).length;
            const selectable =
              view.canVote &&
              alive &&
              userId !== profile?.id &&
              (view.runoff.length === 0 || view.runoff.includes(userId));
            return (
              <m.button
                key={userId}
                type="button"
                variants={rise}
                initial="initial"
                animate="animate"
                exit="exit"
                disabled={!selectable}
                onClick={() => {
                  haptic.select();
                  setPicked(userId);
                }}
                className={`relative flex flex-col gap-2 rounded-[18px] px-3 py-3 text-left transition-colors ${
                  picked === userId ? "bg-accent-quiet" : "panel"
                } ${alive ? "" : "opacity-40 grayscale"}`}
              >
                <span className="flex items-center gap-2.5">
                  <Avatar seed={seedOf(userId)} size={34} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                    {nameOf(userId)}
                  </span>
                  {votes > 0 && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-display text-[11px] font-extrabold tabular">
                      {votes}
                    </span>
                  )}
                </span>

                {Object.keys(shown).length > 0 && (
                  <span className="flex flex-col gap-0.5">
                    {FIELDS.filter((field) => shown[field]).map((field) => (
                      <span key={field} className="truncate text-[11.5px] text-hint">
                        <span className="text-secondary">
                          {describe(field, shown[field])}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </m.button>
            );
          })}
        </AnimatePresence>
      </div>

      {view.phase === "speech" && view.youSpeak && (
        <Button full onClick={() => act("done_speaking", {})}>
          {t("games.board.bunker.doneSpeaking")}
        </Button>
      )}

      {view.phase === "debate" && view.youAlive && (
        <Button full variant="surface" onClick={() => act("done_debating", {})}>
          {t("games.board.bunker.doneDebating")}
        </Button>
      )}

      {view.phase === "vote" && view.canVote && (
        <Button
          full
          disabled={picked === null}
          onClick={() => {
            if (picked === null) return;
            act("vote", { target: picked });
            setPicked(null);
          }}
        >
          {t("games.board.bunker.castVote")}
        </Button>
      )}

      <div className="flex items-center gap-2">
        <Button full variant="quiet" onClick={() => setDossier(true)}>
          {t("games.board.bunker.yourDossier")}
        </Button>
      </div>

      <Sheet
        open={dossier}
        onClose={() => setDossier(false)}
        title={t("games.board.bunker.yourDossier")}
      >
        <div className="space-y-3 pb-2">
          {FIELDS.map((field) => (
            <div key={field} className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-hint">
                {t(`games.board.bunker.field.${field}`)}
              </span>
              <span className="text-right text-[13.5px] font-semibold">
                {describe(field, view.yourDossier[field])}
              </span>
            </div>
          ))}

          {view.yourCards.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-[12.5px] font-semibold text-secondary">
                {t("games.board.bunker.yourCards")}
              </p>
              <div className="flex flex-wrap gap-2">
                {view.yourCards.map((card, index) => (
                  <m.button
                    key={`${card}-${index}`}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    transition={spring.snappy}
                    onClick={() => {
                      act("play_card", { card, target: picked ?? 0 });
                      setDossier(false);
                    }}
                    className="rounded-full bg-elevated px-3.5 py-2 text-[12.5px] font-semibold"
                  >
                    {t(`games.board.bunker.card.${card}`)}
                  </m.button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] leading-snug text-hint">
                {t("games.board.bunker.cardsHint")}
              </p>
            </div>
          )}
        </div>
      </Sheet>

      {view.phase === "finished" && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Chip tone="live">{t("games.board.bunker.survivors")}</Chip>
          {view.alive.map((userId) => (
            <Chip key={userId}>{nameOf(userId)}</Chip>
          ))}
        </div>
      )}
    </div>
  );
};
