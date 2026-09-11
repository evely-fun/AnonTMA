import { useState } from "react";

import { Button, Chip, VoiceOrb } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import styles from "./games.module.css";

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
  roundLog: { word: string; status: string; by?: number }[];
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

  const nameOf = (userId: number | null): string => {
    if (userId === null) {
      return "—";
    }
    if (userId === profile?.id) {
      return "You";
    }
    return members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `Player ${userId}`;
  };

  const guesses = events
    .filter((event) => event.type === "alias.guess")
    .slice(-8)
    .reverse();

  const submit = (): void => {
    if (!guess.trim()) {
      return;
    }
    act("guess", { text: guess.trim() });
    setGuess("");
  };

  return (
    <div className={styles.stage}>
      <div className={styles.statusBar}>
        <div>
          <span className={styles.phase}>Team {view.turn.toUpperCase()} explains</span>
          <span className={styles.phaseValue}>{nameOf(view.explainer)}</span>
        </div>
        <span className={styles.countdown}>⏱ {view.secondsLeft}</span>
      </div>

      <div className={styles.scoreRow}>
        <div className={styles.scoreItem}>
          <span className={styles.scoreValue}>{view.scores.a}</span>
          <span className={styles.scoreLabel}>team a{view.yourTeam === "a" ? " · you" : ""}</span>
        </div>
        <div className={styles.scoreItem}>
          <span className={styles.scoreValue}>{view.target}</span>
          <span className={styles.scoreLabel}>to win</span>
        </div>
        <div className={styles.scoreItem}>
          <span className={styles.scoreValue}>{view.scores.b}</span>
          <span className={styles.scoreLabel}>team b{view.yourTeam === "b" ? " · you" : ""}</span>
        </div>
      </div>

      {view.phase === "finished" ? (
        <div className={styles.wordCard}>
          <span className={styles.wordLabel}>winner</span>
          <span className={styles.wordValue}>Team {String(view.winner ?? "").toUpperCase()}</span>
        </div>
      ) : view.youExplain ? (
        <>
          <div className={styles.wordCard}>
            <span className={styles.wordLabel}>explain without saying it</span>
            <span className={styles.wordValue}>{word ?? view.word ?? "…"}</span>
          </div>
          <VoiceOrb level={micLevel} tone="voice" size={140}>
            🗣
          </VoiceOrb>
          <div className={styles.actions}>
            <Button
              full
              variant="secondary"
              disabled={view.skips >= view.maxSkips}
              onClick={() => act("skip", {})}
            >
              Skip ({view.maxSkips - view.skips} left)
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>
            {view.turn === view.yourTeam
              ? "Your teammate is explaining. Type your guesses fast."
              : "The other team is playing. Listen and keep them honest."}
          </p>
          {view.turn === view.yourTeam ? (
            <div className={styles.composer}>
              <input
                className={styles.input}
                value={guess}
                maxLength={60}
                placeholder="Your guess"
                onChange={(event) => setGuess(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    submit();
                  }
                }}
              />
              <Chip tone="accent" onClick={submit}>
                Guess
              </Chip>
            </div>
          ) : null}
          <Button variant="ghost" onClick={() => act("violation", {})}>
            They said the word
          </Button>
        </>
      )}

      <div className={styles.feed}>
        {guesses.map((event) => (
          <div
            key={event.id}
            className={[styles.feedItem, event.payload.correct ? styles.feedGood : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {nameOf(Number(event.payload.by))}: {String(event.payload.text)}
            {event.payload.correct ? " ✓" : ""}
          </div>
        ))}
      </div>
    </div>
  );
};
