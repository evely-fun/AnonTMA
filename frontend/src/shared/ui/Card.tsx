import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { haptics } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

import styles from "./Card.module.css";

interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  padded?: boolean;
  glow?: boolean;
  className?: string;
}

export const Card = ({ children, onClick, padded = true, glow = false, className = "" }: CardProps) => {
  const classes = [styles.card, padded ? styles.padded : "", glow ? styles.glow : "", className]
    .filter(Boolean)
    .join(" ");

  if (!onClick) {
    return <div className={classes}>{children}</div>;
  }

  return (
    <motion.button
      type="button"
      className={[classes, styles.interactive].join(" ")}
      whileTap={{ scale: 0.985 }}
      transition={spring}
      onClick={() => {
        haptics.impact("light");
        onClick();
      }}
    >
      {children}
    </motion.button>
  );
};

interface SectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  subtitle?: string;
}

export const Section = ({ title, action, subtitle, children }: SectionProps) => (
  <section className={styles.section}>
    <header className={styles.sectionHeader}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle ? <p className={styles.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {action}
    </header>
    {children}
  </section>
);
