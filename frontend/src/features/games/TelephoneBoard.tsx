import { useState } from "react";

import { Button, Chip, VoiceOrb } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import styles from "./games.module.css";

interface View {
  phase: string;
  round: number;
  rounds: number;
  step: number;
  chain: number[];
  speaker: number | null;
  listener: number | null;
  youSpeak: boolean;
  youListen: boolean;
  totals: Record<string, number>;
  reveal: {
    original: string;
    final: string;
    history: { from: number; to: number; said: string; heard: string; accuracy: number }[];
  } | null;
  secondsLeft: number;
}

export const TelephoneBoard = ({ view }: { view: View }) => {
  const act = useGames((state) => state.act);
  const phrase = useGames((state) => state.privateState.phrase as string | undefined);
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

  const submit = (): void => {
    act("submit", { text: guess.trim() });
    setGuess("");
  };

  if (view.phase === "reveal" || view.phase === "finished") {
    return (
      <div className={styles.stage}>
        <div className={styles.statusBar}>
          <div>
            <span className={styles.phase}>
              Round {view.round} of {view.rounds}
            </span>
            <span className={styles.phaseValue}>How it mutated</span>
          </div>
          {view.secondsLeft > 0 ? <span className={styles.countdown}>⏱ {view.secondsLeft}</span> : null}
        </div>

        <div className={styles.wordCard}>
          <span className={styles.wordLabel}>original</span>
          <span className={styles.wordValue}>{view.reveal?.original}</span>
        </div>

        <div className={styles.revealList}>
          {view.reveal?.history.map((step, index) => (
            <div key={index} className={styles.revealRow}>
              <span className={styles.revealSaid}>
                {nameOf(step.from)} → {nameOf(step.to)}
              </span>
              <span className={styles.revealHeard}>heard: {step.heard}</span>
              <span className={styles.accuracy}>{step.accuracy}% kept</span>
            </div>
          ))}
        </div>

        <div className={styles.wordCard}>
          <span className={styles.wordLabel}>final</span>
          <span className={styles.wordValue}>{view.reveal?.final}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <div className={styles.statusBar}>
        <div>
          <span className={styles.phase}>
            Step {view.step + 1} of {Math.max(1, view.chain.length - 1)}
          </span>
          <span className={styles.phaseValue}>
            {nameOf(view.speaker)} whispers to {nameOf(view.listener)}
          </span>
        </div>
        <span className={styles.countdown}>⏱ {view.secondsLeft}</span>
      </div>

      {view.youSpeak ? (
        <>
          <div className={styles.wordCard}>
            <span className={styles.wordLabel}>say this out loud, once</span>
            <span className={styles.wordValue}>{phrase ?? "…"}</span>
          </div>
          <VoiceOrb level={micLevel} tone="warm" size={150}>
            🎙
          </VoiceOrb>
          <Button full onClick={() => act("done_speaking", {})}>
            I said it
          </Button>
        </>
      ) : view.youListen ? (
        <>
          <p className={styles.hint}>
            {view.phase === "speak"
              ? "Listen closely, only you can hear the speaker."
              : "Type exactly what you heard."}
          </p>
          <VoiceOrb level={0.2} tone="voice" size={130} active={view.phase === "speak"}>
            👂
          </VoiceOrb>
          {view.phase === "write" ? (
            <div className={styles.composer}>
              <input
                className={styles.input}
                value={guess}
                maxLength={160}
                placeholder="What did you hear?"
                onChange={(event) => setGuess(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    submit();
                  }
                }}
              />
              <Chip tone="accent" onClick={submit}>
                Pass on
              </Chip>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className={styles.hint}>
            Your microphone is off for this step. Wait for your turn in the chain.
          </p>
          <div className={styles.playerList}>
            {view.chain.map((userId, index) => (
              <div
                key={userId}
                className={[
                  styles.playerRow,
                  index === view.step || index === view.step + 1 ? styles.playerSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={styles.playerTag}>{index + 1}</span>
                <span className={styles.playerName}>{nameOf(userId)}</span>
                <span className={styles.playerTag}>{view.totals[String(userId)] ?? 0} pts</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
