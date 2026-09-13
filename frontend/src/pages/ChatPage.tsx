import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AudioSheet } from "@/features/voice/AudioSheet";
import { useElapsed } from "@/shared/hooks/useElapsed";
import { useT } from "@/shared/i18n";
import { clockFormat } from "@/shared/lib/format";
import { openLink } from "@/shared/lib/telegram";
import { ease, pop, rise } from "@/shared/lib/motion";
import {
  Avatar,
  Button,
  Chip,
  IconButton,
  PushScreen,
  ScreenHeader,
  Sheet,
  SignalWave,
  tileArt,
  VoiceBloom,
} from "@/shared/ui";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  FlagIcon,
  HeartIcon,
  MaskIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  SkipIcon,
  SlidersIcon,
  WaveIcon,
} from "@/shared/ui/icons";
import { useChat } from "@/store/chat";
import { useVoice } from "@/store/voice";

const REPORT_REASONS = ["abuse", "adult", "spam", "scam", "underage", "other"];

const Searching = ({ mode, onCancel }: { mode: "text" | "voice"; onCancel: () => void }) => {
  const { t } = useT();
  const seconds = useElapsed(true);
  const queue = useChat((state) => state.queue);

  return (
    <m.div
      className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: ease.out }}
    >
      <div className="w-full max-w-[320px]">
        <SignalWave energy={0.35 + Math.min(0.45, queue * 0.08)} height={132} />
      </div>

      {/* The wave carries the waiting, the picture carries the mood. A pulsing
          grey glyph did neither. */}
      <m.img
        src={tileArt(mode === "voice" ? "call" : "search").src}
        alt=""
        className="-mt-4 size-[104px] rounded-[28px] object-cover"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="flex flex-col items-center gap-1.5">
        <h2 className="font-display text-[20px] font-extrabold tracking-[-0.025em]">
          {t("chat.looking")}
        </h2>
        <p className="text-[13px] leading-snug text-hint">
          {queue > 1 ? t("chat.queue", { count: queue }) : t("chat.matching")}
        </p>
        <span className="mt-1 font-display text-[14px] font-bold text-secondary tabular">
          {clockFormat(seconds)}
        </span>
      </div>

      <Button variant="surface" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
    </m.div>
  );
};

const Summary = ({ onNext, onHome }: { onNext: () => void; onHome: () => void }) => {
  const { t } = useT();
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
        {summary?.mutualLike ? t("chat.mutualLike") : t("chat.finished")}
      </h2>
      <p className="text-[13.5px] text-hint tabular">
        {t("chat.together", { time: clockFormat(summary?.durationSeconds ?? 0) })}
        {summary?.reward?.xp ? ` · +${summary.reward.xp} XP` : ""}
        {summary?.reward?.coins ? ` · +${summary.reward.coins} ${t("common.coins")}` : ""}
      </p>
      <div className="mt-5 flex w-full max-w-[300px] flex-col gap-2">
        <Button full onClick={onNext}>
          {t("chat.findNext")}
        </Button>
        <Button full variant="surface" onClick={onHome}>
          {t("chat.backHome")}
        </Button>
      </div>
    </m.div>
  );
};

const VoiceStage = () => {
  const { t } = useT();
  const partner = useChat((state) => state.partner);
  const seconds = useElapsed(true);
  const micLevel = useVoice((state) => state.micLevel);
  const muted = useVoice((state) => state.muted);
  const preset = useVoice((state) => state.preset);
  const permission = useVoice((state) => state.permission);
  const playbackBlocked = useVoice((state) => state.playbackBlocked);
  const maskUnavailable = useVoice((state) => state.maskUnavailable);
  const unlockPlayback = useVoice((state) => state.unlockPlayback);
  const toggleMute = useVoice((state) => state.toggleMute);
  const [sheet, setSheet] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7">
      <VoiceBloom level={micLevel} muted={muted} tone={muted ? "warn" : "live"} size={236}>
        <Avatar
          seed={partner?.seed ?? "anon"}
          style={partner?.avatarStyle}
          frame={partner?.frame}
          size={88}
        />
      </VoiceBloom>

      <div className="flex flex-col items-center gap-1.5">
        <h2 className="font-display text-[20px] font-extrabold tracking-[-0.025em]">
          {partner?.name ?? t("chat.stranger")}
        </h2>
        <span className="font-display text-[14px] font-bold text-secondary tabular">
          {clockFormat(seconds)}
        </span>
        {permission === "denied" && <Chip tone="danger">{t("chat.micBlocked")}</Chip>}
        {playbackBlocked && (
          <m.button
            type="button"
            onClick={() => void unlockPlayback()}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 rounded-full bg-warn/15 px-3 py-1.5 font-display text-[12px] font-bold text-warn"
          >
            <WaveIcon size={13} />
            {t("chat.tapToHear")}
          </m.button>
        )}
        {preset !== "natural" && !maskUnavailable && (
          <Chip tone="accent">{t(`voice.presets.${preset}.name`)}</Chip>
        )}
        {maskUnavailable && <Chip tone="danger">{t("voice.maskDown")}</Chip>}
      </div>

      <div className="flex items-center gap-5">
        <IconButton label={t("chat.audioSettings")} onClick={() => setSheet(true)} size={46}>
          <SlidersIcon size={19} />
        </IconButton>
        <IconButton
          label={muted ? t("chat.unmute") : t("chat.mute")}
          tone={muted ? "danger" : "live"}
          size={66}
          onClick={toggleMute}
        >
          {muted ? <MicOffIcon size={26} /> : <MicIcon size={26} />}
        </IconButton>
        <IconButton label={t("voice.changer")} onClick={() => setSheet(true)} size={46}>
          <MaskIcon size={19} />
        </IconButton>
      </div>

      <AudioSheet open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
};

const TextStage = () => {
  const { t } = useT();
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
                  {message.text === "You are connected. Say hello."
                    ? t("chat.sayHello")
                    : message.text}
                </span>
              ) : (
                <span
                  className={`max-w-[78%] break-words px-4 py-2.5 text-[14.5px] leading-snug ${
                    message.own
                      ? "accent-action rounded-[18px] rounded-br-[6px]"
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
            placeholder={t("chat.message", {
              name: partner?.name?.split(" ")[0] ?? t("chat.stranger"),
            })}
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


const RevealCard = () => {
  const { t } = useT();
  const revealed = useChat((state) => state.revealed);
  const incoming = useChat((state) => state.revealIncoming);
  const pending = useChat((state) => state.revealPending);
  const partner = useChat((state) => state.partner);
  const accept = useChat((state) => state.acceptReveal);
  const decline = useChat((state) => state.declineReveal);

  if (revealed) {
    const handle = revealed.username ? `@${revealed.username}` : null;
    return (
      <m.button
        type="button"
        onClick={() => handle && openLink(`https://t.me/${revealed.username}`)}
        disabled={!handle}
        variants={pop}
        initial="initial"
        animate="animate"
        className="panel-hero mx-4 mb-1 flex items-center gap-3 rounded-[18px] px-4 py-3 text-left"
      >
        {revealed.photoUrl ? (
          <img
            src={revealed.photoUrl}
            alt=""
            className="size-11 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <Avatar seed={revealed.avatarSeed || partner?.seed || "anon"} size={44} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] font-extrabold tracking-[-0.015em]">
            {revealed.name || revealed.anonName}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[12.5px]">
            {handle && <span className="truncate text-accent">{handle}</span>}
            <span className="shrink-0 text-[11.5px] text-hint">
              {t("common.level")} {revealed.level}
            </span>
          </span>
        </span>
        {revealed.friend && <CheckIcon size={17} className="shrink-0 text-live" />}
        {handle && <ArrowUpRightIcon size={15} className="shrink-0 text-hint" />}
      </m.button>
    );
  }

  if (incoming) {
    return (
      <m.div
        variants={pop}
        initial="initial"
        animate="animate"
        className="panel-hero mx-4 mb-1 rounded-[18px] px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-quiet text-accent">
            <MaskIcon size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[14.5px] font-bold tracking-[-0.01em]">
              {partner?.name ?? t("chat.stranger")} {t("chat.revealAsk")}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-hint">{t("chat.revealAskBody")}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button full size="sm" onClick={accept}>
            {t("chat.revealAccept")}
          </Button>
          <Button full size="sm" variant="surface" onClick={decline}>
            {t("chat.revealDecline")}
          </Button>
        </div>
      </m.div>
    );
  }

  if (pending) {
    return (
      <div className="mx-4 mb-1 flex items-center justify-center gap-2 rounded-[16px] bg-elevated/60 px-4 py-2.5 text-[12.5px] text-hint">
        <ClockIcon size={14} />
        {t("chat.revealWaiting")}
      </div>
    );
  }

  return null;
};

export const ChatPage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const phase = useChat((state) => state.phase);
  const mode = useChat((state) => state.mode);
  const partner = useChat((state) => state.partner);
  const liked = useChat((state) => state.liked);
  const partnerLiked = useChat((state) => state.partnerLiked);
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
    <PushScreen>
      <ScreenHeader
        title={phase === "connected" ? (partner?.name ?? t("chat.stranger")) : t("chat.title")}
        subtitle={
          phase === "connected"
            ? mode === "voice"
              ? t("chat.voiceChannel")
              : t("chat.textChannel")
            : t("chat.notConnected")
        }
        onBack={() => {
          if (phase === "searching") cancelSearch();
          goHome();
        }}
        trailing={
          phase === "connected" ? (
            <IconButton
              label={t("chat.report")}
              tone="danger"
              size={36}
              onClick={() => setReportOpen(true)}
            >
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
            <RevealCard />

            {mode === "voice" ? <VoiceStage /> : <TextStage />}

            <div className="flex items-center justify-center gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2">
              <IconButton
                label={t("chat.like")}
                tone={liked || partnerLiked ? "danger" : "surface"}
                size={44}
                onClick={like}
              >
                <HeartIcon size={19} />
              </IconButton>
              <IconButton label={t("chat.reveal")} size={44} onClick={requestReveal}>
                <MaskIcon size={19} />
              </IconButton>
              <Button variant="surface" icon={<SkipIcon size={16} />} onClick={next}>
                {t("common.next")}
              </Button>
              <IconButton label={t("chat.end")} tone="danger" size={44} onClick={end}>
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

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title={t("chat.reportTitle")}>
        <div className="flex flex-col gap-2 pb-2">
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => {
                report(reason);
                setReportOpen(false);
              }}
              className="rounded-[14px] bg-elevated/60 px-4 py-3.5 text-left font-display text-[14px] font-bold"
            >
              {t(`chat.reasons.${reason}`)}
            </button>
          ))}
        </div>
      </Sheet>
    </PushScreen>
  );
};
