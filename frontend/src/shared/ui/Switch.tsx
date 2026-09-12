import { m } from "motion/react";

import { haptic } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

export const Switch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onPointerDown={() => haptic.select()}
    onClick={() => onChange(!checked)}
    className={`flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-300 ${
      checked ? "justify-end bg-accent" : "justify-start bg-bezel"
    }`}
  >
    <m.span layout transition={spring.snappy} className="size-6 rounded-full bg-label" />
  </button>
);
