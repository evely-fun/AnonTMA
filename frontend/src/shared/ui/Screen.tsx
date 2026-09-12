import { m } from "motion/react";
import type { ReactNode } from "react";

import { haptic } from "@/shared/lib/telegram";
import { spring, tabContent } from "@/shared/lib/motion";

import { ChevronIcon } from "./icons";

export const TabScreen = ({ children }: { children: ReactNode }) => (
  <m.div variants={tabContent} initial="initial" animate="animate" exit="exit">
    {children}
  </m.div>
);

export const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  trailing,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: ReactNode;
}) => (
  <header className="glass sticky top-0 z-20 flex items-center gap-3 px-4 pb-3 pt-[calc(10px+env(safe-area-inset-top))]">
    {onBack && (
      <m.button
        type="button"
        onPointerDown={() => haptic.impact("light")}
        onClick={onBack}
        whileTap={{ scale: 0.9 }}
        transition={spring.snappy}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated text-label"
        aria-label="Back"
      >
        <ChevronIcon size={17} className="rotate-180" />
      </m.button>
    )}
    <div className="min-w-0 flex-1">
      <h1 className="truncate font-display text-[19px] font-extrabold tracking-[-0.02em]">
        {title}
      </h1>
      {subtitle && <p className="truncate text-[12.5px] text-hint">{subtitle}</p>}
    </div>
    {trailing}
  </header>
);
