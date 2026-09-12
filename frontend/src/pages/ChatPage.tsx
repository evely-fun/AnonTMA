import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { NOISE_LEVELS, type NoiseLevel } from "@/features/voice/noise";
import { useElapsed } from "@/shared/hooks/useElapsed";
import { clockFormat } from "@/shared/lib/format";
import { ease, pop, rise } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import {
  Avatar,
  Button,
  Chip,
  IconButton,
  ScreenHeader,
  Sheet,
  VoiceOrb,
} from "@/shared/ui";
import {
  CheckIcon,
  CloseIcon,
  FlagIcon,
  HeartIcon,
  MaskIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  SkipIcon,
  SlidersIcon,
} from "@/shared/ui/icons";
import { useChat } from "@/store/chat";
import { useVoice } from "@/store/voice";

const REPORT_REASONS = [
  { value: "abuse", label: "Abuse or insults" },
  { value: "adult", label: "Adult content" },
  { value: "spam", label: "Spam or advertising" },
  { value: "scam", label: "Scam attempt" },
  { value: "underage", label: "Underage user" },
  { value: "other", label: "Something else" },
];

const Searching = ({ mode, onCancel }: { mode: "text" | "voice"; onCancel: () => void }) => {
  const seconds = useElapsed(true);
  const queue = useChat((state) => state.queue);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="relative flex size-[190px] items-center justify-center">
        <span className="ping-ring absolute inset-0 rounded-full border border-accent/40" />
        <span
          className="ping-ring absolute inset-0 rounded-full border border-accent/30"
          style={{ animationDelay: "1.2s" }}
        />
        <span
          className="sweep absolute inset-[12%] rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, oklch(0.72 0.115 236 / 0.28) 70deg, transparent 150deg)",
          }}
        />
        <span className="relative flex size-[84px] items-center justify-center rounded-full bg-elevated text-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.14)]">
          {mode === "voice" ? <MicIcon size={30} /> : <MaskIcon size={30} />}
        </span>
      </div>

      <h2 className="font-display text-[21px] font-extrabold tracking-[-0.025em]">
        Looking for someone
      </h2>
      <p className="text-[13.5px] leading-snug text-hint">
        {queue > 1
          ? `${queue} people are in the queue right now`
          : "Matching you by language and interests"}
      </p>
      <span className="font-display text-[15px] font-bold text-secondary tabular">
        {clockFormat(seconds)}
      </span>
      <Button variant="surface" onClick={onCancel} className="mt-2">
        Cancel
      </Button>
    </div>
  );
};

const Summary = ({ onNext, onHome }: { onNext: () => void; onHome: () => void }) => {
  const summary = useChat((state) => state.summary);

  return (
    <m.div
      className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center"
      variants={pop}
      initial="initial"
      animate="animate"
    >
      <span
        className={`flex size-16 items-center justify-center rounded-[22px] ${
          summary?.mutualLike ? "bg-destructive-quiet text-destructive" : "bg-elevated text-hint"
        }`}
      >
        {summary?.mutualLike ? <HeartIcon size={28} /> : <CheckIcon size={28} />}
      </span>
      <h2 className="font-display text-[21px] font-extrabold tracking-[-0.025em]">
        {summary?.mutualLike ? "You both liked it" : "Conversation finished"}
      </h2>
      <p className="text-[13.5px] text-hint tabular">
        {clockFormat(summary?.durationSeconds ?? 0)} together
        {summary?.reward?.xp ? ` · +${summary.reward.xp} XP` : ""}
        {summary?.reward?.coins ? ` · +${summary.reward.coins} coins` : ""}
      </p>
      <div className="mt-5 flex w-full max-w-[300px] flex-col gap-2">
        <Button full onClick={onNext}>
          Find next
        </Button>
        <Button full variant="surface" onClick={onHome}>
          Back home
        </Button>
      </div>
    </m.div>
  );
};

const VoiceStage = () => {
  const partner = useChat((state) => state.partner);
  const seconds = useElapsed(true);
  const micLevel = useVoice((state) => state.micLevel);
  const muted = useVoice((state) => state.muted);
  const level = useVoice((state) => state.level);
  const permission = useVoice((state) => state.permission);
  const toggleMute = useVoice((state) => state.toggleMute);
  const setLevel = useVoice((state) => state.setLevel);
  const [sheet, setSheet] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7">
      <VoiceOrb level={micLevel} muted={muted} tone={muted ? "warn" : "live"} size={236}>
        <Avatar seed={partner?.seed ?? "anon"} size={86} speaking={!muted && micLevel > 0.12} />
      </VoiceOrb>

      <div className="flex flex-col items-center gap-1.5">
        <h2 className="font-display text-[20px] font-extrabold tracking-[-0.025em]">
          {partner?.name ?? "Anonymous"}
        </h2>
        <span className="font-display text-[14px] font-bold text-secondary tabular">
          {clockFormat(seconds)}
        </span>
        {permission === "denied" && (
          <Chip tone="danger">Microphone blocked in settings</Chip>
        )}
      </div>

      <div className="flex items-center gap-5">
        <IconButton label="Audio settings" onClick={() => setSheet(true)} size={46}>
          <SlidersIcon size={19} />
        </IconButton>
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          tone={muted ? "danger" : "live"}
          size={66}
          onClick={toggleMute}
        >
          {muted ? <MicOffIcon size={26} /> : <MicIcon size={26} />}
        </IconButton>
        <IconButton label="Noise level" onClick={() => setSheet(true)} size={46}>
          <span className="font-display text-[11px] font-extrabold uppercase tracking-[0.08em]">
            {level === "off" ? "off" : level === "light" ? "low" : level === "medium" ? "bal" : "max"}
          </span>
        </IconButton>
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Noise suppression"
        description="Everything is processed on your device, no audio is uploaded."
      >
        <div className="flex flex-col gap-2 pb-2">
          {NOISE_LEVELS.map((option) => {
            const active = level === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  haptic.select();
                  setLevel(option.value as NoiseLevel);
                }}
                className={`flex items-center gap-3 rounded-[16px] px-4 py-3.5 text-left transition-colors ${
                  active ? "bg-accent-quiet" : "bg-elevated/60"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-display text-[14.5px] font-bold ${
                      active ? "text-accent" : "text-label"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-hint">{option.hint}</span>
                </span>
                {active && (
                  <span className="text-accent">
                    <CheckIcon size={17} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
};

const TextStage = () => {
  const messages = useChat((state) => state.messages);
  const typing = useChat((state) => state.partnerTyping);
  const partner = useChat((state) => state.partner);
  const sendMessage = useChat((state) => state.sendMessage);
  const setTyping = useChat((state) => state.setTyping);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  const onChange = (value: string) => {
    setDraft(value);
    setTyping(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTyping(false), 1400);
  };

  const submit = () => {
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft("");
    setTyping(false);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <m.div
              key={message.id}
              variants={rise}
              initial="initial"
              animate="animate"
              className={`flex ${
                message.system ? "justify-center" : message.own ? "justify-end" : "justify-start"
              }`}
            >
              {message.system ? (
                <span className="rounded-full bg-elevated/70 px-3 py-1 text-[11.5px] text-hint">
                  {message.text}
                </span>
              ) : (
                <span
                  className={`max-w-[78%] break-words px-4 py-2.5 text-[14.5px] leading-snug ${
                    message.own
                      ? "rounded-[18px] rounded-br-[6px] bg-accent text-[oklch(0.16_0.02_250)]"
                      : "rounded-[18px] rounded-bl-[6px] bg-surface text-label"
                  }`}
                >
                  {message.text}
                </span>
              )}
            </m.div>
          ))}
        </AnimatePresence>

        {typing && (
          <div className="flex justify-start">
            <span className="flex items-center gap-1 rounded-[18px] rounded-bl-[6px] bg-surface px-4 py-3.5">
              {[0, 1, 2].map((dot) => (
                <m.i
                  key={dot}
                  className="size-1.5 rounded-full bg-hint"
                  animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15 }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 px-4 pb-2">
        <div className="flex flex-1 items-center rounded-[16px] bg-surface px-4">
          <input
            className="h-[46px] w-full text-[14.5px]"
            value={draft}
            maxLength={1000}
            placeholder={`Message ${partner?.name?.split(" ")[0] ?? "stranger"}`}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
        </div>
        <IconButton label="Send" tone="light" size={46} onClick={submit}>
          <SendIcon size={18} />
        </IconButton>
      </div>
    </div>
  );
};

export const ChatPage = () => {
  const navigate = useNavigate();
  const phase = useChat((state) => state.phase);
  const mode = useChat((state) => state.mode);
  const partner = useChat((state) => state.partner);
  const liked = useChat((state) => state.liked);
  const partnerLiked = useChat((state) => state.partnerLiked);
  const revealed = useChat((state) => state.revealed);
  const cancelSearch = useChat((state) => state.cancelSearch);
  const like = useChat((state) => state.like);
  const next = useChat((state) => state.next);
  const end = useChat((state) => state.end);
  const report = useChat((state) => state.report);
  const requestReveal = useChat((state) => state.requestReveal);
  const reset = useChat((state) => state.reset);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (phase === "idle") navigate("/");
  }, [phase, navigate]);

  const goHome = () => {
    reset();
    navigate("/");
  };

  return (
    <m.div
      className="flex h-full flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.26, ease: ease.out }}
    >
      <ScreenHeader
        title={phase === "connected" ? (partner?.name ?? "Anonymous") : "Anonymous chat"}
        subtitle={
          phase === "connected"
            ? mode === "voice"
              ? "voice channel"
              : "text channel"
            : "not connected yet"
        }
        onBack={() => {
          if (phase === "searching") cancelSearch();
          goHome();
        }}
        trailing={
          phase === "connected" ? (
            <IconButton label="Report" tone="danger" size={36} onClick={() => setReportOpen(true)}>
              <FlagIcon size={16} />
            </IconButton>
          ) : undefined
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {phase === "searching" && (
          <Searching
            mode={mode}
            onCancel={() => {
              cancelSearch();
              goHome();
            }}
          />
        )}

        {phase === "connected" && (
          <>
            {revealed && (
              <div className="mx-4 mb-1 flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3">
                <Avatar seed={partner?.seed ?? "anon"} size={34} />
                <div className="min-w-0">
                  <p className="truncate font-display text-[13.5px] font-bold">
                    {revealed.anonName}
                  </p>
                  {revealed.username && (
                    <p className="text-[12px] text-accent">@{revealed.username}</p>
                  )}
                </div>
              </div>
            )}

            {mode === "voice" ? <VoiceStage /> : <TextStage />}

            <div className="flex items-center justify-center gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2">
              <IconButton
                label="Like"
                tone={liked || partnerLiked ? "danger" : "surface"}
                size={44}
                onClick={like}
              >
                <HeartIcon size={19} />
              </IconButton>
              <IconButton label="Reveal" size={44} onClick={requestReveal}>
                <MaskIcon size={19} />
              </IconButton>
              <Button variant="surface" icon={<SkipIcon size={16} />} onClick={next}>
                Next
              </Button>
              <IconButton label="End" tone="danger" size={44} onClick={end}>
                <CloseIcon size={18} />
              </IconButton>
            </div>
          </>
        )}

        {phase === "ended" && (
          <Summary
            onNext={() => {
              reset();
              useChat.getState().startSearch(mode);
            }}
            onHome={goHome}
          />
        )}
      </div>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report this person">
        <div className="flex flex-col gap-2 pb-2">
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              onClick={() => {
                report(reason.value);
                setReportOpen(false);
              }}
              className="rounded-[14px] bg-elevated/60 px-4 py-3.5 text-left font-display text-[14px] font-bold"
            >
              {reason.label}
            </button>
          ))}
        </div>
      </Sheet>
    </m.div>
  );
};
