import { useState } from "react";

import { Button, IconButton, VoiceOrb } from "@/shared/ui";
import { MicIcon, SendIcon, WaveIcon } from "@/shared/ui/icons";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import { GameStatus, WordCard } from "./shared";

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

  const nameOf = (userId: number | null) => {
    if (userId === null) return "—";
    if (userId === profile?.id) return "You";
    return members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `P${userId}`;
  };

  if (view.phase === "reveal" || view.phase === "finished") {
    return (
      <div className="flex flex-col gap-4">
        <GameStatus
          eyebrow={`Round ${view.round} of ${view.rounds}`}
          title="How it mutated"
          seconds={view.secondsLeft}
        />
        <WordCard label="original" value={view.reveal?.original ?? ""} />
        <div className="flex flex-col gap-2">
          {view.reveal?.history.map((entry, index) => (
            <div key={index} className="panel rounded-[16px] px-4 py-3">
              <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-hint">
                {nameOf(entry.from)} to {nameOf(entry.to)}
              </span>
              <p className="mt-1 text-[14px] leading-snug">{entry.heard}</p>
              <span className="mt-2 inline-block rounded-full bg-accent-quiet px-2.5 py-0.5 font-display text-[10.5px] font-bold text-accent tabular">
                {entry.accuracy}% kept
              </span>
            </div>
          ))}
        </div>
        <WordCard label="final" value={view.reveal?.final ?? ""} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <GameStatus
        eyebrow={`Step ${view.step + 1} of ${Math.max(1, view.chain.length - 1)}`}
        title={`${nameOf(view.speaker)} whispers to ${nameOf(view.listener)}`}
        seconds={view.secondsLeft}
      />

      {view.youSpeak ? (
        <>
          <WordCard label="say this out loud, once" value={phrase ?? "…"} />
          <div className="flex justify-center">
            <VoiceOrb level={micLevel} size={170} tone="warn">
              <MicIcon size={26} />
            </VoiceOrb>
          </div>
          <Button full onClick={() => act("done_speaking", {})}>
            I said it
          </Button>
        </>
      ) : view.youListen ? (
        <>
          <p className="text-center text-[13.5px] leading-snug text-hint">
            {view.phase === "speak"
              ? "Listen closely, only you can hear the speaker."
              : "Type exactly what you heard."}
          </p>
          <div className="flex justify-center">
            <VoiceOrb level={0.25} size={150} tone="live" pulse={view.phase === "speak"}>
              <WaveIcon size={24} />
            </VoiceOrb>
          </div>
          {view.phase === "write" && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-[16px] bg-surface px-4">
                <input
                  className="h-[46px] w-full text-[14.5px]"
                  value={guess}
                  maxLength={160}
                  placeholder="What did you hear?"
                  onChange={(event) => setGuess(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      act("submit", { text: guess.trim() });
                      setGuess("");
                    }
                  }}
                />
              </div>
              <IconButton
                label="Pass on"
                tone="light"
                size={46}
                onClick={() => {
                  act("submit", { text: guess.trim() });
                  setGuess("");
                }}
              >
                <SendIcon size={18} />
              </IconButton>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-center text-[13.5px] leading-snug text-hint">
            Your microphone is off for this step. Wait for your turn in the chain.
          </p>
          <div className="flex flex-col gap-2">
            {view.chain.map((userId, index) => {
              const active = index === view.step || index === view.step + 1;
              return (
                <div
                  key={userId}
                  className={`flex items-center gap-3 rounded-[14px] px-4 py-2.5 ${
                    active ? "bg-accent-quiet" : "panel"
                  }`}
                >
                  <span className="font-display text-[11px] font-bold text-hint tabular">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold">
                    {nameOf(userId)}
                  </span>
                  <span className="font-display text-[12px] font-bold text-hint tabular">
                    {view.totals[String(userId)] ?? 0}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
