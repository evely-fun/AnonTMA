import { AnimatePresence, m } from "motion/react";
import { useEffect, type ReactNode } from "react";

import { ease, spring } from "@/shared/lib/motion";

export interface RewardLine {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "accent" | "warn" | "live";
}

const TONE: Record<string, string> = {
  accent: "text-accent",
  warn: "text-warn",
  live: "text-live",
};

/**
 * A short overlay that names exactly what was won. It closes on tap or by
 * itself, so a reward is never a number that silently changed in the corner.
 */
export const RewardBurst = ({
  open,
  title,
  lines,
  onClose,
  autoCloseMs = 3200,
}: {
  open: boolean;
  title: string;
  lines: RewardLine[];
  onClose: () => void;
  autoCloseMs?: number;
}) => {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [open, onClose, autoCloseMs]);

  return (
    <AnimatePresence>
      {open && (
        <m.button
          type="button"
          onClick={onClose}
          className="veil fixed inset-0 z-[120] mx-auto flex max-w-[480px] flex-col items-center justify-center gap-5 px-10 backdrop-blur-[10px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.22 } }}
        >
          <m.h2
            className="font-display text-[24px] font-extrabold tracking-[-0.03em]"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring.ui}
          >
            {title}
          </m.h2>

          <div className="flex w-full max-w-[300px] flex-col gap-2">
            {lines.map((line, index) => (
              <m.div
                key={line.label}
                className="panel flex items-center gap-3 rounded-[16px] px-4 py-3"
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: 0.08 + index * 0.09,
                  duration: 0.42,
                  ease: ease.out,
                }}
              >
                <span className={`shrink-0 ${TONE[line.tone ?? "accent"]}`}>{line.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-secondary">
                  {line.label}
                </span>
                <span
                  className={`shrink-0 font-display text-[17px] font-extrabold tabular ${
                    TONE[line.tone ?? "accent"]
                  }`}
                >
                  {line.value}
                </span>
              </m.div>
            ))}
          </div>
        </m.button>
      )}
    </AnimatePresence>
  );
};
