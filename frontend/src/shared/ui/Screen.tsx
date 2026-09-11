import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { pageVariants } from "@/shared/lib/motion";

import styles from "./Screen.module.css";

interface ScreenProps {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  padded?: boolean;
  bare?: boolean;
  className?: string;
}

export const Screen = ({
  children,
  title,
  subtitle,
  leading,
  trailing,
  padded = true,
  bare = false,
  className = "",
}: ScreenProps) => (
  <motion.main
    className={[styles.screen, bare ? styles.bare : "", className].filter(Boolean).join(" ")}
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    {title ? (
      <header className={styles.header}>
        <div className={styles.headerSide}>{leading}</div>
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        <div className={[styles.headerSide, styles.headerRight].join(" ")}>{trailing}</div>
      </header>
    ) : null}
    <div className={[styles.content, padded ? styles.padded : "", "scroller"].filter(Boolean).join(" ")}>
      {children}
    </div>
  </motion.main>
);
