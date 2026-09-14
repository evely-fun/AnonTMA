import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { useT } from "@/shared/i18n";
import { rise } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { Avatar, Button, Chip, Panel, Sheet } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";

import { BunkerCard, CARD_ART, PhaseBanner } from "./art";

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
  voteRound: number;
  defending: boolean;
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
          : view.phase === "defence"
            ? view.defending
              ? t("games.board.bunker.yourDefence")
              : t("games.board.bunker.defenceOf", { name: nameOf(view.speaker) })
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
        <div className="flex items-center gap-3">
          <img
            src={CARD_ART.catastrophe}
            alt=""
            width={46}
            height={46}
            className="size-[46px] shrink-0 object-contain"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-extrabold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">
              {t(`games.board.bunker.catastrophe.${view.catastrophe}`)}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-hint [overflow-wrap:anywhere]">
              {t(`games.board.bunker.fault.${view.shelter.fault}`)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-[12px] font-semibold tabular">
            <img src={CARD_ART.shelter} alt="" width={16} height={16} className="size-4 object-contain" />
            {view.places}
          </span>
        </div>
      </Panel>

      <PhaseBanner
        phase={view.phase === "vote" ? "vote" : view.phase === "debate" ? "discussion" : "speech"}
        eyebrow={`${t("games.board.bunker.round", { current: view.round })} · ${t(
          `games.board.bunker.rounds.${Math.min(view.round, 3)}`,
        )}`}
        title={headline}
        seconds={view.secondsLeft}
      />

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
                  <span className="flex flex-col gap-1">
                    {FIELDS.filter((field) => shown[field]).map((field) => (
                      <BunkerCard
                        key={field}
                        compact
                        field={field}
                        label={t(`games.board.bunker.field.${field}`)}
                        value={describe(field, shown[field])}
                      />
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

      {view.phase === "defence" && view.defending && (
        <Button full onClick={() => act("done_speaking", {})}>
          {t("games.board.bunker.doneSpeaking")}
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
        <div className="space-y-2 pb-2">
          {FIELDS.map((field) => (
            <BunkerCard
              key={field}
              field={field}
              label={t(`games.board.bunker.field.${field}`)}
              value={describe(field, view.yourDossier[field])}
            />
          ))}

          {view.yourCards.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-[12.5px] font-semibold text-secondary">
                {t("games.board.bunker.yourCards")}
              </p>
              <div className="flex flex-col gap-2">
                {view.yourCards.map((card, index) => (
                  <BunkerCard
                    key={`${card}-${index}`}
                    compact
                    field="action"
                    label={t("games.board.bunker.yourCards")}
                    value={t(`games.board.bunker.card.${card}`)}
                    onClick={() => {
                      act("play_card", { card, target: picked ?? 0 });
                      setDossier(false);
                    }}
                  />
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
