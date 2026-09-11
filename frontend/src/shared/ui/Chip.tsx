import type { ReactNode } from "react";

import { haptics } from "@/shared/lib/telegram";

import styles from "./Chip.module.css";

interface ChipProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "accent" | "mint" | "amber" | "danger";
  size?: "sm" | "md";
}

export const Chip = ({ children, active = false, onClick, tone = "neutral", size = "md" }: ChipProps) => {
  const classes = [styles.chip, styles[tone], styles[size], active ? styles.active : ""]
    .filter(Boolean)
    .join(" ");

  if (!onClick) {
    return <span className={classes}>{children}</span>;
  }

  return (
    <button
      type="button"
      className={classes}
      onClick={() => {
        haptics.select();
        onClick();
      }}
    >
      {children}
    </button>
  );
};
