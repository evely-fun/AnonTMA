import { AnimatePresence, motion } from "framer-motion";

import { useElapsed } from "@/shared/hooks/useElapsed";
import { clockFormat } from "@/shared/lib/format";
import { popVariants } from "@/shared/lib/motion";
import { Avatar, IconButton, VoiceOrb } from "@/shared/ui";
import { useSocial } from "@/store/social";
import { useVoice } from "@/store/voice";

import styles from "./CallOverlay.module.css";

const ActiveCall = () => {
  const call = useSocial((state) => state.activeCall);
  const friends = useSocial((state) => state.friends);
  const endCall = useSocial((state) => state.endCall);
  const micLevel = useVoice((state) => state.micLevel);
  const muted = useVoice((state) => state.muted);
  const toggleMute = useVoice((state) => state.toggleMute);
  const seconds = useElapsed(call?.status === "active");

  if (!call) {
    return null;
  }
  const friend = friends.find((item) => item.id === call.userId);

  return (
    <motion.div
      className={styles.panel}
      variants={popVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <VoiceOrb level={micLevel} muted={muted} tone="voice" size={92}>
        📞
      </VoiceOrb>
      <div className={styles.info}>
        <span className={styles.name}>{friend?.anonName ?? "Friend"}</span>
        <span className={styles.meta}>
          {call.status === "ringing" ? "ringing…" : clockFormat(seconds)}
        </span>
      </div>
      <div className={styles.actions}>
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          tone={muted ? "danger" : "neutral"}
          size="sm"
          onClick={toggleMute}
        >
          {muted ? "🔇" : "🎙"}
        </IconButton>
        <IconButton label="End call" tone="danger" size="sm" onClick={endCall}>
          ✕
        </IconButton>
      </div>
    </motion.div>
  );
};

const IncomingCall = () => {
  const call = useSocial((state) => state.incomingCall);
  const answer = useSocial((state) => state.answerCall);

  if (!call) {
    return null;
  }

  return (
    <motion.div
      className={styles.incoming}
      variants={popVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className={styles.incomingCard}>
        <Avatar seed={call.from.avatarSeed} size={82} speaking />
        <p className={styles.incomingName}>{call.from.anonName}</p>
        <p className={styles.incomingHint}>is calling you</p>
        <div className={styles.incomingActions}>
          <IconButton label="Decline" tone="danger" size="lg" onClick={() => answer(false)}>
            ✕
          </IconButton>
          <IconButton label="Accept" tone="success" size="lg" onClick={() => answer(true)}>
            📞
          </IconButton>
        </div>
      </div>
    </motion.div>
  );
};

export const CallOverlay = () => {
  const activeCall = useSocial((state) => state.activeCall);
  const incomingCall = useSocial((state) => state.incomingCall);

  return (
    <>
      <AnimatePresence>{activeCall ? <ActiveCall /> : null}</AnimatePresence>
      <AnimatePresence>{incomingCall ? <IncomingCall /> : null}</AnimatePresence>
    </>
  );
};
