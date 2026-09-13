import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { useElapsed } from "@/shared/hooks/useElapsed";
import { useT } from "@/shared/i18n";
import { clockFormat } from "@/shared/lib/format";
import { pop, spring } from "@/shared/lib/motion";
import { AudioSheet } from "@/features/voice/AudioSheet";
import { Avatar, IconButton, VoiceBloom } from "@/shared/ui";
import { MicIcon, MicOffIcon, PhoneEndIcon, PhoneIcon, SlidersIcon } from "@/shared/ui/icons";
import { useSocial } from "@/store/social";
import { useVoice } from "@/store/voice";

const ActiveCall = ({
  call,
  onOpenAudio,
}: {
  call: NonNullable<ReturnType<typeof useSocial.getState>["activeCall"]>;
  onOpenAudio: () => void;
}) => {
  const { t } = useT();
  const friends = useSocial((state) => state.friends);
  const endCall = useSocial((state) => state.endCall);
  const micLevel = useVoice((state) => state.micLevel);
  const muted = useVoice((state) => state.muted);
  const toggleMute = useVoice((state) => state.toggleMute);
  const seconds = useElapsed(call.status === "active");
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
          {friend?.anonName ?? t("nav.friends")}
        </p>
        <p className="text-[11.5px] text-hint tabular">
          {call.status === "ringing" ? t("friends.ringing") : clockFormat(seconds)}
        </p>
      </div>
      <IconButton
        label={t("chat.audioSettings")}
        tone="surface"
        size={38}
        onClick={onOpenAudio}
      >
        <SlidersIcon size={16} />
      </IconButton>
      <IconButton
        label={muted ? t("chat.unmute") : t("chat.mute")}
        tone={muted ? "danger" : "surface"}
        size={38}
        onClick={toggleMute}
      >
        {muted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
      </IconButton>
      <IconButton label={t("chat.end")} tone="danger" size={38} onClick={endCall}>
        <PhoneEndIcon size={16} />
      </IconButton>
    </m.div>
  );
};

const IncomingCall = ({
  call,
}: {
  call: NonNullable<ReturnType<typeof useSocial.getState>["incomingCall"]>;
}) => {
  const { t } = useT();
  const answer = useSocial((state) => state.answerCall);

  return (
    <m.div
      className="veil fixed inset-0 z-[130] mx-auto flex max-w-[480px] items-center justify-center px-6"
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
        <VoiceBloom level={0.4} size={200} tone="live">
          <Avatar seed={call.from.avatarSeed} size={78} />
        </VoiceBloom>
        <p className="mt-4 font-display text-[20px] font-extrabold tracking-[-0.025em]">
          {call.from.anonName}
        </p>
        <p className="text-[12.5px] text-hint">
          {t("friends.incomingCall")}
        </p>
        <div className="mt-8 flex items-center gap-10">
          <IconButton label={t("common.cancel")} tone="danger" size={62} onClick={() => answer(false)}>
            <PhoneEndIcon size={24} />
          </IconButton>
          <IconButton label={t("friends.call")} tone="live" size={62} onClick={() => answer(true)}>
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
  const [audioOpen, setAudioOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {activeCall && (
          <ActiveCall key="active" call={activeCall} onOpenAudio={() => setAudioOpen(true)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {incomingCall && <IncomingCall key="incoming" call={incomingCall} />}
      </AnimatePresence>
      <AudioSheet open={audioOpen && Boolean(activeCall)} onClose={() => setAudioOpen(false)} />
    </>
  );
};
