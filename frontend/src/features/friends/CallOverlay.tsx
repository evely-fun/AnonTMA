import { AnimatePresence, m } from "motion/react";

import { useElapsed } from "@/shared/hooks/useElapsed";
import { clockFormat } from "@/shared/lib/format";
import { pop, spring } from "@/shared/lib/motion";
import { Avatar, IconButton, VoiceOrb } from "@/shared/ui";
import { MicIcon, MicOffIcon, PhoneEndIcon, PhoneIcon } from "@/shared/ui/icons";
import { useSocial } from "@/store/social";
import { useVoice } from "@/store/voice";

const ActiveCall = () => {
  const call = useSocial((state) => state.activeCall);
  const friends = useSocial((state) => state.friends);
  const endCall = useSocial((state) => state.endCall);
  const micLevel = useVoice((state) => state.micLevel);
  const muted = useVoice((state) => state.muted);
  const toggleMute = useVoice((state) => state.toggleMute);
  const seconds = useElapsed(call?.status === "active");

  if (!call) return null;
  const friend = friends.find((item) => item.id === call.userId);

  return (
    <m.div
      className="nav-island fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[90] mx-auto flex max-w-[456px] items-center gap-3 rounded-[20px] px-4 py-3"
      variants={pop}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={spring.ui}
    >
      <Avatar seed={friend?.avatarSeed ?? "anon"} size={38} speaking={!muted && micLevel > 0.12} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[14px] font-bold tracking-[-0.01em]">
          {friend?.anonName ?? "Friend"}
        </p>
        <p className="text-[11.5px] text-hint tabular">
          {call.status === "ringing" ? "ringing…" : clockFormat(seconds)}
        </p>
      </div>
      <IconButton
        label={muted ? "Unmute" : "Mute"}
        tone={muted ? "danger" : "surface"}
        size={38}
        onClick={toggleMute}
      >
        {muted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
      </IconButton>
      <IconButton label="End call" tone="danger" size={38} onClick={endCall}>
        <PhoneEndIcon size={16} />
      </IconButton>
    </m.div>
  );
};

const IncomingCall = () => {
  const call = useSocial((state) => state.incomingCall);
  const answer = useSocial((state) => state.answerCall);

  if (!call) return null;

  return (
    <m.div
      className="fixed inset-0 z-[130] mx-auto flex max-w-[480px] items-center justify-center bg-[rgb(4_6_11/0.8)] px-6 backdrop-blur-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <m.div
        className="flex w-full max-w-[320px] flex-col items-center gap-2 text-center"
        variants={pop}
        initial="initial"
        animate="animate"
      >
        <VoiceOrb level={0.35} size={190} tone="live">
          <Avatar seed={call.from.avatarSeed} size={74} />
        </VoiceOrb>
        <p className="mt-4 font-display text-[20px] font-extrabold tracking-[-0.025em]">
          {call.from.anonName}
        </p>
        <p className="font-display text-[11.5px] font-bold uppercase tracking-[0.14em] text-hint">
          incoming call
        </p>
        <div className="mt-8 flex items-center gap-10">
          <IconButton label="Decline" tone="danger" size={62} onClick={() => answer(false)}>
            <PhoneEndIcon size={24} />
          </IconButton>
          <IconButton label="Accept" tone="live" size={62} onClick={() => answer(true)}>
            <PhoneIcon size={24} />
          </IconButton>
        </div>
      </m.div>
    </m.div>
  );
};

export const CallOverlay = () => {
  const activeCall = useSocial((state) => state.activeCall);
  const incomingCall = useSocial((state) => state.incomingCall);

  return (
    <>
      <AnimatePresence>{activeCall && <ActiveCall />}</AnimatePresence>
      <AnimatePresence>{incomingCall && <IncomingCall />}</AnimatePresence>
    </>
  );
};
