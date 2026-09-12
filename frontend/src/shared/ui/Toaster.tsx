import { AnimatePresence, m } from "motion/react";

import { spring } from "@/shared/lib/motion";
import { useUi } from "@/store/ui";

import { CheckIcon, FlagIcon, SparkleIcon } from "./icons";

const ICONS = {
  neutral: SparkleIcon,
  success: CheckIcon,
  danger: FlagIcon,
};

const TONES = {
  neutral: "text-accent",
  success: "text-live",
  danger: "text-destructive",
};

export const Toaster = () => {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] mx-auto flex max-w-[480px] flex-col gap-2 px-4 pt-[calc(10px+env(safe-area-inset-top))]">
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <m.button
              key={item.id}
              type="button"
              layout
              className="glass pointer-events-auto flex w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left shadow-[0_18px_46px_-28px_oklch(0_0_0/0.95)]"
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={spring.ui}
              onClick={() => dismiss(item.id)}
            >
              <span className={TONES[item.tone]}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[13.5px] font-bold tracking-[-0.01em]">
                  {item.title}
                </span>
                {item.description && (
                  <span className="block truncate text-[12px] text-hint">{item.description}</span>
                )}
              </span>
            </m.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
