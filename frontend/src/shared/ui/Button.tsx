import { m } from "motion/react";
import type { ReactNode } from "react";

import { haptic } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

type Variant = "primary" | "accent" | "surface" | "quiet" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "primary-action",
  accent: "accent-action",
  surface: "bg-elevated text-label",
  quiet: "bg-transparent text-secondary",
  danger: "bg-destructive text-label",
};

const SIZES = {
  sm: "h-9 px-4 text-[13px] rounded-[12px]",
  md: "h-[46px] px-5 text-[15px] rounded-[15px]",
  lg: "h-[54px] px-6 text-[16px] rounded-[17px]",
};

export const Button = ({
  children,
  onClick,
  variant = "primary",
  size = "md",
  icon,
  full,
  disabled,
  loading,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: keyof typeof SIZES;
  icon?: ReactNode;
  full?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) => (
  <m.button
    type="button"
    disabled={disabled || loading}
    onPointerDown={() => !disabled && haptic.impact("light")}
    onClick={onClick}
    whileTap={disabled || loading ? undefined : { scale: 0.96 }}
    transition={spring.snappy}
    className={`inline-flex items-center justify-center gap-2 font-display font-bold tracking-[-0.01em] transition-opacity disabled:opacity-40 ${
      VARIANTS[variant]
    } ${SIZES[size]} ${full ? "w-full" : ""} ${className}`}
  >
    {loading ? (
      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
    ) : (
      icon
    )}
    {children}
  </m.button>
);

export const IconButton = ({
  children,
  onClick,
  label,
  tone = "surface",
  size = 46,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  tone?: "surface" | "accent" | "live" | "danger" | "light";
  size?: number;
  disabled?: boolean;
}) => {
  const tones = {
    surface: "bg-elevated text-label",
    accent: "bg-accent-quiet text-accent",
    live: "bg-live-quiet text-live",
    danger: "bg-destructive-quiet text-destructive",
    light: "primary-action",
  };
  return (
    <m.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={() => !disabled && haptic.impact("medium")}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={spring.snappy}
      className={`flex shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-35 ${tones[tone]}`}
      style={{ width: size, height: size }}
    >
      {children}
    </m.button>
  );
};
