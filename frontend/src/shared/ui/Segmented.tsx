import { m } from "motion/react";

import { haptic } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  id,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  id: string;
}) => (
  <div className="relative flex rounded-[14px] bg-elevated/70 p-1" role="tablist">
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={active}
          onPointerDown={() => haptic.select()}
          onClick={() => !active && onChange(option.value)}
          className="relative flex-1 py-2"
        >
          {active && (
            <m.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-[11px] bg-label"
              transition={spring.snappy}
            />
          )}
          <span
            className={`relative font-display text-[13px] font-bold tracking-[-0.01em] transition-colors duration-200 ${
              active ? "text-bg" : "text-hint"
            }`}
          >
            {option.label}
          </span>
        </button>
      );
    })}
  </div>
);
