import { useState } from "react";

import { Button, IconButton, VoiceOrb } from "@/shared/ui";
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
  const act = useGames((state) => state.act);
  const events = useGames((state) => state.events);
  const word = useGames((state) => state.privateState.word as string | undefined);
  const members = useRooms((state) => state.members);
  const profile = useSession((state) => state.profile);
  const micLevel = useVoice((state) => state.micLevel);
  const [guess, setGuess] = useState("");

  const nameOf = (userId: number | null) => {
    if (userId === null) return "—";
    if (userId === profile?.id) return "You";
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
        eyebrow={`Team ${view.turn.toUpperCase()} explains`}
        title={nameOf(view.explainer)}
        seconds={view.secondsLeft}
      />

      <ScoreRow
        items={[
          {
            value: view.scores.a,
            label: view.yourTeam === "a" ? "team a · you" : "team a",
            tone: view.yourTeam === "a" ? "accent" : "label",
          },
          { value: view.target, label: "to win" },
          {
            value: view.scores.b,
            label: view.yourTeam === "b" ? "team b · you" : "team b",
            tone: view.yourTeam === "b" ? "accent" : "label",
          },
        ]}
      />

      {view.phase === "finished" ? (
        <WordCard label="winner" value={`Team ${String(view.winner ?? "").toUpperCase()}`} />
      ) : view.youExplain ? (
        <>
          <WordCard label="explain without saying it" value={word ?? view.word ?? "…"} />
          <div className="flex justify-center">
            <VoiceOrb level={micLevel} size={150} tone="live">
              <WaveIcon size={24} />
            </VoiceOrb>
          </div>
          <Button
            full
            variant="surface"
            disabled={view.skips >= view.maxSkips}
            onClick={() => act("skip", {})}
          >
            Skip word · {view.maxSkips - view.skips} left
          </Button>
        </>
      ) : (
        <>
          <p className="text-center text-[13.5px] leading-snug text-hint">
            {view.turn === view.yourTeam
              ? "Your teammate is explaining. Type guesses fast."
              : "The other team is playing. Listen and keep them honest."}
          </p>

          {view.turn === view.yourTeam && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-[16px] bg-surface px-4">
                <input
                  className="h-[46px] w-full text-[14.5px]"
                  value={guess}
                  maxLength={60}
                  placeholder="Your guess"
                  onChange={(event) => setGuess(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && submit()}
                />
              </div>
              <IconButton label="Guess" tone="light" size={46} onClick={submit}>
                <SendIcon size={18} />
              </IconButton>
            </div>
          )}

          <Button
            variant="quiet"
            icon={<FlagIcon size={15} />}
            onClick={() => act("violation", {})}
          >
            They said the word
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
