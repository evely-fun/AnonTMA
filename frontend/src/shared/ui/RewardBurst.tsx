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
 *
 * The reward arrives as one card rather than loose rows floating on a dimmed
 * screen: a single object to look at, and nothing behind it is blurred, which
 * only ever made the page underneath look broken.
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
          className="veil fixed inset-0 z-[120] mx-auto flex max-w-[480px] items-center justify-center px-8 text-left"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.22 } }}
        >
          <m.div
            className="panel w-full max-w-[320px] rounded-[26px] px-5 py-6"
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.18 } }}
            transition={spring.ui}
          >
            <h2 className="text-center font-display text-[21px] font-extrabold tracking-[-0.03em]">
              {title}
            </h2>

            <div className="mt-5 flex flex-col gap-3">
              {lines.map((line, index) => (
                <m.div
                  key={line.label}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 0.12 + index * 0.08,
                    duration: 0.34,
                    ease: ease.out,
                  }}
                >
                  <span className={`shrink-0 ${TONE[line.tone ?? "accent"]}`}>{line.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-secondary first-letter:uppercase">
                    {line.label}
                  </span>
                  <span className="shrink-0 font-display text-[19px] font-extrabold tabular">
                    {line.value}
                  </span>
                </m.div>
              ))}
            </div>
          </m.div>
        </m.button>
      )}
    </AnimatePresence>
  );
};
