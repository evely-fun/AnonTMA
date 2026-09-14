import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";

import entranceClip from "@/assets/video/entrance.webm";
import { useT } from "@/shared/i18n";
import { spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { Avatar } from "@/shared/ui";

interface Arrival {
  id: number;
  userId: number;
  anonName: string;
  avatarSeed: string;
  avatarStyle?: string;
  frame?: string;
}

/**
 * Someone with their entrance turned on walking into a room.
 *
 * It runs once, for a few seconds, and cannot be tapped through by accident
 * because it does not take pointer events at all. A clip rather than a stack
 * of CSS keyframes: it is seventy kilobytes, decodes on the compositor, and
 * looks like something rather than like an animated gradient.
 */
export const EntranceOverlay = ({
  arrival,
  onDone,
}: {
  arrival: Arrival | null;
  onDone: () => void;
}) => {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  useEffect(() => {
    if (!arrival) return;
    haptic.impact("heavy");
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    }
    const timer = window.setTimeout(onDone, reduced ? 1800 : 4000);
    return () => window.clearTimeout(timer);
  }, [arrival, onDone, reduced]);

  return (
    <AnimatePresence>
      {arrival && (
        <m.div
          key={`entrance-${arrival.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="entrance-stage pointer-events-none fixed inset-0 z-[60] mx-auto flex max-w-[480px] flex-col items-center justify-end overflow-hidden pb-[22%]"
        >
          {!reduced && (
            <video
              ref={videoRef}
              src={entranceClip}
              muted
              playsInline
              preload="auto"
              className="absolute inset-0 size-full scale-110 object-cover opacity-70"
            />
          )}

          <div className="entrance-scrim absolute inset-0" />

          <m.div
            initial={{ scale: 0.86, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ ...spring.soft, delay: reduced ? 0 : 0.9 }}
            className="relative flex flex-col items-center gap-2.5 px-8 text-center"
          >
            <Avatar
              seed={arrival.avatarSeed}
              style={arrival.avatarStyle}
              frame={arrival.frame ?? "veil"}
              size={92}
            />
            <span className="mt-1.5 block font-display text-[12px] font-bold tracking-[0.02em] text-white/65">
              {t("rooms.entranceEyebrow")}
            </span>
            <span className="name-crimson block font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
              {arrival.anonName}
            </span>
            <span className="mt-1 block h-px w-16 bg-white/25" />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
