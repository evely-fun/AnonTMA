import { useState } from "react";

import { useT } from "@/shared/i18n";
import { Button, IconButton, VoiceBloom } from "@/shared/ui";
import { FlagIcon, SendIcon, WaveIcon } from "@/shared/ui/icons";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import { GameStatus, ScoreRow, WordCard } from "./shared";

interface View {
  phase: string;
  teams: { a: number[]; b: number[] };
  yourTeam: "a" | "b";
  turn: "a" | "b";
  explainer: number | null;
  youExplain: boolean;
  word: string | null;
  scores: { a: number; b: number };
  personal: Record<string, number>;
  skips: number;
  maxSkips: number;
  target: number;
  winner: string | null;
  secondsLeft: number;
}

export const AliasBoard = ({ view }: { view: View }) => {
  const { t } = useT();
  const act = useGames((state) => state.act);
  const events = useGames((state) => state.events);
  const word = useGames((state) => state.privateState.word as string | undefined);
  const members = useRooms((state) => state.members);
  const profile = useSession((state) => state.profile);
  const micLevel = useVoice((state) => state.micLevel);
  const [guess, setGuess] = useState("");

  const nameOf = (userId: number | null) => {
    if (userId === null) return "—";
    if (userId === profile?.id) return t("common.you");
    return members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `P${userId}`;
  };

  const guesses = events
    .filter((event) => event.type === "alias.guess")
    .slice(-6)
    .reverse();

  const submit = () => {
    if (!guess.trim()) return;
    act("guess", { text: guess.trim() });
    setGuess("");
  };

  return (
    <div className="flex flex-col gap-5">
      <GameStatus
        eyebrow={t("games.board.teamExplains", { team: view.turn.toUpperCase() })}
        title={nameOf(view.explainer)}
        seconds={view.secondsLeft}
      />

      <ScoreRow
        items={[
          {
            value: view.scores.a,
            label:
              view.yourTeam === "a"
                ? `${t("games.board.teamA")} · ${t("common.you")}`
                : t("games.board.teamA"),
            tone: view.yourTeam === "a" ? "accent" : "label",
          },
          { value: view.target, label: t("games.board.toWin") },
          {
            value: view.scores.b,
            label:
              view.yourTeam === "b"
                ? `${t("games.board.teamB")} · ${t("common.you")}`
                : t("games.board.teamB"),
            tone: view.yourTeam === "b" ? "accent" : "label",
          },
        ]}
      />

      {view.phase === "finished" ? (
        <WordCard
          label={t("games.board.winner")}
          value={String(view.winner ?? "").toUpperCase()}
        />
      ) : view.youExplain ? (
        <>
          <WordCard label={t("games.board.explainWithout")} value={word ?? view.word ?? "…"} />
          <div className="flex justify-center">
            <VoiceBloom level={micLevel} size={150} tone="live">
              <WaveIcon size={24} />
            </VoiceBloom>
          </div>
          <Button
            full
            variant="surface"
            disabled={view.skips >= view.maxSkips}
            onClick={() => act("skip", {})}
          >
            {t("games.board.skipWord", { count: view.maxSkips - view.skips })}
          </Button>
        </>
      ) : (
        <>
          <p className="text-center text-[13.5px] leading-snug text-hint">
            {view.turn === view.yourTeam
              ? t("games.board.teammateExplaining")
              : t("games.board.otherTeam")}
          </p>

          {view.turn === view.yourTeam && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-[16px] bg-surface px-4">
                <input
                  className="h-[46px] w-full text-[14.5px]"
                  value={guess}
                  maxLength={60}
                  placeholder={t("games.board.yourGuess")}
                  onChange={(event) => setGuess(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && submit()}
                />
              </div>
              <IconButton label={t("games.board.guess")} tone="light" size={46} onClick={submit}>
                <SendIcon size={18} />
              </IconButton>
            </div>
          )}

          <Button
            variant="quiet"
            icon={<FlagIcon size={15} />}
            onClick={() => act("violation", {})}
          >
            {t("games.board.saidTheWord")}
          </Button>
        </>
      )}

      {guesses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {guesses.map((event) => (
            <div
              key={event.id}
              className={`rounded-[12px] px-3.5 py-2 text-[12.5px] ${
                event.payload.correct ? "bg-live-quiet text-live" : "bg-elevated/60 text-secondary"
              }`}
            >
              <span className="font-bold">{nameOf(Number(event.payload.by))}</span>{" "}
              {String(event.payload.text)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
