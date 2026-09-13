import { useState } from "react";

import { useT } from "@/shared/i18n";
import { Button, IconButton, VoiceBloom } from "@/shared/ui";
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
  const { t } = useT();
  const act = useGames((state) => state.act);
  const phrase = useGames((state) => state.privateState.phrase as string | undefined);
  const members = useRooms((state) => state.members);
  const profile = useSession((state) => state.profile);
  const micLevel = useVoice((state) => state.micLevel);
  const [guess, setGuess] = useState("");

  const nameOf = (userId: number | null) => {
    if (userId === null) return "—";
    if (userId === profile?.id) return t("common.you");
    return members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `P${userId}`;
  };

  if (view.phase === "reveal" || view.phase === "finished") {
    return (
      <div className="flex flex-col gap-4">
        <GameStatus
          eyebrow={t("games.board.round", { current: view.round, total: view.rounds })}
          title={t("games.board.howItMutated")}
          seconds={view.secondsLeft}
        />
        <WordCard label={t("games.board.original")} value={view.reveal?.original ?? ""} />
        <div className="relative pl-8">
          <span aria-hidden className="absolute bottom-4 left-[7px] top-2 w-px bg-separator" />
          {view.reveal?.history.map((entry, index) => (
            <div key={index} className="relative py-2.5">
              <span
                aria-hidden
                className="absolute -left-8 top-[13px] size-[15px] rounded-full bg-elevated"
              />
              <p className="text-[12px] text-hint">
                {t("games.board.whispers", { from: nameOf(entry.from), to: nameOf(entry.to) })}
              </p>
              <p className="mt-1 text-[14.5px] leading-snug">{entry.heard}</p>
              <p className="mt-1 text-[12px] text-accent tabular">
                {t("games.board.kept", { value: entry.accuracy })}
              </p>
            </div>
          ))}
        </div>
        <WordCard label={t("games.board.final")} value={view.reveal?.final ?? ""} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <GameStatus
        eyebrow={t("games.board.step", {
          current: view.step + 1,
          total: Math.max(1, view.chain.length - 1),
        })}
        title={t("games.board.whispers", {
          from: nameOf(view.speaker),
          to: nameOf(view.listener),
        })}
        seconds={view.secondsLeft}
      />

      {view.youSpeak ? (
        <>
          <WordCard label={t("games.board.sayOutLoud")} value={phrase ?? "…"} />
          <div className="flex justify-center">
            <VoiceBloom level={micLevel} size={170} tone="warn">
              <MicIcon size={26} />
            </VoiceBloom>
          </div>
          <Button full onClick={() => act("done_speaking", {})}>
            {t("games.board.iSaidIt")}
          </Button>
        </>
      ) : view.youListen ? (
        <>
          <p className="text-center text-[13.5px] leading-snug text-hint">
            {view.phase === "speak"
              ? t("games.board.listenClosely")
              : t("games.board.typeWhatHeard")}
          </p>
          <div className="flex justify-center">
            <VoiceBloom level={0.3} size={150} tone="live">
              <WaveIcon size={24} />
            </VoiceBloom>
          </div>
          {view.phase === "write" && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-[16px] bg-surface px-4">
                <input
                  className="h-[46px] w-full text-[14.5px]"
                  value={guess}
                  maxLength={160}
                  placeholder={t("games.board.whatDidYouHear")}
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
                label={t("games.board.passOn")}
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
            {t("games.board.micOffThisStep")}
          </p>
          <div className="relative px-2">
            <span aria-hidden className="absolute bottom-5 left-[19px] top-5 w-px bg-separator" />
            {view.chain.map((userId, index) => {
              const active = index === view.step || index === view.step + 1;
              return (
                <div key={userId} className="relative flex items-center gap-3.5 py-2">
                  <span
                    className={`relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full font-display text-[10.5px] font-extrabold tabular ${
                      active ? "bg-accent text-on-accent" : "bg-elevated text-hint"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[14px] ${
                      active ? "font-bold" : "text-secondary"
                    }`}
                  >
                    {nameOf(userId)}
                  </span>
                  <span className="text-[12.5px] text-hint tabular">
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
