import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { NOISE_LEVELS, type NoiseLevel } from "@/features/voice/noise";
import { useBackButton } from "@/shared/hooks/useBackButton";
import { useElapsed } from "@/shared/hooks/useElapsed";
import { clockFormat } from "@/shared/lib/format";
import { itemVariants, popVariants } from "@/shared/lib/motion";
import { haptics } from "@/shared/lib/telegram";
import { Avatar, Button, Card, Chip, IconButton, Screen, Sheet, VoiceOrb } from "@/shared/ui";
import { useChat } from "@/store/chat";
import { useVoice } from "@/store/voice";

import styles from "./ChatPage.module.css";

const REPORT_REASONS = [
  { value: "abuse", label: "Abuse or insults" },
  { value: "adult", label: "Adult content" },
  { value: "spam", label: "Spam or ads" },
  { value: "scam", label: "Scam attempt" },
  { value: "underage", label: "Underage user" },
  { value: "other", label: "Something else" },
];

const Searching = ({ mode, onCancel }: { mode: "text" | "voice"; onCancel: () => void }) => {
  const seconds = useElapsed(true);
  const queue = useChat((state) => state.queue);

  return (
    <div className={styles.centered}>
      <div className={styles.radar}>
        <span className={styles.radarRing} />
        <span className={[styles.radarRing, styles.radarRingDelay].join(" ")} />
        <span className={styles.radarSweep} />
        <span className={styles.radarCore}>{mode === "voice" ? "🎙" : "✉️"}</span>
      </div>
      <h2 className={styles.searchTitle}>Looking for someone</h2>
      <p className={styles.searchHint}>
        {queue > 1 ? `${queue} people in the queue right now` : "Matching you with a good companion"}
      </p>
      <span className={[styles.timer, "numeric"].join(" ")}>{clockFormat(seconds)}</span>
      <Button variant="secondary" onClick={onCancel}>
        Cancel search
      </Button>
    </div>
  );
};

const Summary = ({ onNext, onHome }: { onNext: () => void; onHome: () => void }) => {
  const summary = useChat((state) => state.summary);

  return (
    <motion.div className={styles.centered} variants={popVariants} initial="initial" animate="animate">
      <div className={styles.summaryIcon}>{summary?.mutualLike ? "💜" : "👋"}</div>
      <h2 className={styles.searchTitle}>
        {summary?.mutualLike ? "You both liked it" : "Conversation finished"}
      </h2>
      <p className={styles.searchHint}>
        {clockFormat(summary?.durationSeconds ?? 0)} together
        {summary?.reward?.xp ? ` · +${summary.reward.xp} XP · +${summary.reward.coins ?? 0} coins` : ""}
      </p>
      <div className={styles.summaryActions}>
        <Button full onClick={onNext} icon="⚡️">
          Find next
        </Button>
        <Button full variant="secondary" onClick={onHome}>
          Back home
        </Button>
      </div>
    </motion.div>
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
    <div className={styles.voiceStage}>
      <VoiceOrb level={micLevel} muted={muted} tone="voice" size={230}>
        <span className={styles.orbInitial}>{partner?.name?.charAt(0) ?? "?"}</span>
      </VoiceOrb>

      <div className={styles.voiceMeta}>
        <h2 className={styles.partnerName}>{partner?.name ?? "Anonymous"}</h2>
        <span className={[styles.timer, "numeric"].join(" ")}>{clockFormat(seconds)}</span>
        {permission === "denied" ? (
          <Chip tone="danger" size="sm">
            Microphone blocked
          </Chip>
        ) : null}
      </div>

      <div className={styles.voiceControls}>
        <IconButton
          label="Noise suppression"
          tone="neutral"
          size="md"
          onClick={() => setSheet(true)}
        >
          ✨
        </IconButton>
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          tone={muted ? "danger" : "success"}
          size="lg"
          onClick={toggleMute}
        >
          {muted ? "🔇" : "🎙"}
        </IconButton>
        <IconButton label="Noise level" tone="neutral" size="md" onClick={() => setSheet(true)}>
          {level === "off" ? "○" : level === "light" ? "◔" : level === "medium" ? "◑" : "●"}
        </IconButton>
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Noise suppression"
        description="Processing runs on your device, nothing is uploaded."
      >
        <div className={styles.levelList}>
          {NOISE_LEVELS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={[styles.levelOption, level === option.value ? styles.levelActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                haptics.select();
                setLevel(option.value as NoiseLevel);
              }}
            >
              <span className={styles.levelName}>{option.label}</span>
              <span className={styles.levelHint}>{option.hint}</span>
            </button>
          ))}
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
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  const onChange = (value: string): void => {
    setDraft(value);
    setTyping(true);
    if (typingTimer.current) {
      window.clearTimeout(typingTimer.current);
    }
    typingTimer.current = window.setTimeout(() => setTyping(false), 1400);
  };

  const submit = (): void => {
    if (!draft.trim()) {
      return;
    }
    sendMessage(draft);
    setDraft("");
    setTyping(false);
  };

  return (
    <div className={styles.textStage}>
      <div className={[styles.messages, "scroller"].join(" ")}>
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              variants={itemVariants}
              initial="initial"
              animate="animate"
              className={[
                styles.bubbleRow,
                message.own ? styles.own : "",
                message.system ? styles.systemRow : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {message.system ? (
                <span className={styles.system}>{message.text}</span>
              ) : (
                <span className={styles.bubble}>{message.text}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {typing ? (
          <div className={styles.bubbleRow}>
            <span className={[styles.bubble, styles.typing].join(" ")}>
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className={styles.composer}>
        <input
          className={styles.input}
          value={draft}
          maxLength={1000}
          placeholder={`Message ${partner?.name?.split(" ")[0] ?? "stranger"}`}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submit();
            }
          }}
        />
        <IconButton label="Send" tone="accent" onClick={submit}>
          ➤
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

  useBackButton("/");

  useEffect(() => {
    if (phase === "idle") {
      navigate("/");
    }
  }, [phase, navigate]);

  const goHome = (): void => {
    reset();
    navigate("/");
  };

  return (
    <Screen
      bare
      padded={false}
      title={phase === "connected" ? partner?.name ?? "Anonymous" : "Anonymous chat"}
      subtitle={phase === "connected" ? (mode === "voice" ? "voice channel" : "text channel") : undefined}
      leading={
        <IconButton label="Back" size="sm" onClick={goHome}>
          ←
        </IconButton>
      }
      trailing={
        phase === "connected" ? (
          <IconButton label="Report" size="sm" tone="danger" onClick={() => setReportOpen(true)}>
            ⚑
          </IconButton>
        ) : null
      }
    >
      <div className={styles.body}>
        {phase === "searching" ? <Searching mode={mode} onCancel={() => { cancelSearch(); goHome(); }} /> : null}
        {phase === "connected" ? (
          <>
            {revealed ? (
              <Card className={styles.revealCard}>
                <Avatar seed={partner?.seed ?? "anon"} size={36} />
                <div>
                  <p className={styles.revealTitle}>{revealed.anonName}</p>
                  {revealed.username ? (
                    <p className={styles.revealHandle}>@{revealed.username}</p>
                  ) : null}
                </div>
              </Card>
            ) : null}
            {mode === "voice" ? <VoiceStage /> : <TextStage />}
            <div className={styles.actions}>
              <IconButton
                label="Like"
                tone={liked ? "accent" : "neutral"}
                active={liked && partnerLiked}
                onClick={like}
              >
                {partnerLiked ? "💜" : "♥"}
              </IconButton>
              <IconButton label="Reveal" tone="neutral" onClick={requestReveal}>
                🎭
              </IconButton>
              <Button variant="secondary" onClick={next} icon="⏭">
                Next
              </Button>
              <IconButton label="End" tone="danger" onClick={end}>
                ✕
              </IconButton>
            </div>
          </>
        ) : null}
        {phase === "ended" ? (
          <Summary
            onNext={() => {
              reset();
              useChat.getState().startSearch(mode);
            }}
            onHome={goHome}
          />
        ) : null}
      </div>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report this person">
        <div className={styles.levelList}>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              className={styles.levelOption}
              onClick={() => {
                report(reason.value);
                setReportOpen(false);
              }}
            >
              <span className={styles.levelName}>{reason.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
};
