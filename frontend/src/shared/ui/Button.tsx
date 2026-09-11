import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { haptics } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  className?: string;
  type?: "button" | "submit";
}

export const Button = ({
  children,
  onClick,
  variant = "primary",
  size = "md",
  icon,
  trailing,
  disabled = false,
  loading = false,
  full = false,
  className = "",
  type = "button",
}: ButtonProps) => (
  <motion.button
    type={type}
    className={[styles.button, styles[variant], styles[size], full ? styles.full : "", className]
      .filter(Boolean)
      .join(" ")}
    disabled={disabled || loading}
    whileTap={disabled || loading ? undefined : { scale: 0.96 }}
    transition={spring}
    onClick={() => {
      if (disabled || loading) {
        return;
      }
      haptics.impact("light");
      onClick?.();
    }}
  >
    {loading ? <span className={styles.spinner} /> : icon ? <span className={styles.icon}>{icon}</span> : null}
    <span className={styles.label}>{children}</span>
    {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
  </motion.button>
);

interface IconButtonProps {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  tone?: "neutral" | "accent" | "danger" | "success";
  active?: boolean;
  size?: "sm" | "md" | "lg";
}

export const IconButton = ({
  children,
  onClick,
  label,
  tone = "neutral",
  active = false,
  size = "md",
}: IconButtonProps) => (
  <motion.button
    type="button"
    aria-label={label}
    className={[styles.iconButton, styles[`tone_${tone}`], styles[`icon_${size}`], active ? styles.active : ""]
      .filter(Boolean)
      .join(" ")}
    whileTap={{ scale: 0.92 }}
    transition={spring}
    onClick={() => {
      haptics.impact("medium");
      onClick?.();
    }}
  >
    {children}
  </motion.button>
);
