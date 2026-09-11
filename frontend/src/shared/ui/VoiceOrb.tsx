import { motion } from "framer-motion";
import type { ReactNode } from "react";

import styles from "./VoiceOrb.module.css";

interface VoiceOrbProps {
  level: number;
  active?: boolean;
  muted?: boolean;
  size?: number;
  tone?: "brand" | "voice" | "warm";
  children?: ReactNode;
}

export const VoiceOrb = ({
  level,
  active = true,
  muted = false,
  size = 200,
  tone = "brand",
  children,
}: VoiceOrbProps) => {
  const energy = muted ? 0 : Math.min(1, Math.max(0, level));

  return (
    <div className={styles.stage} style={{ width: size, height: size }}>
      <motion.span
        className={[styles.halo, styles[tone]].join(" ")}
        animate={{
          scale: active ? 1 + energy * 0.35 : 1,
          opacity: active ? 0.28 + energy * 0.4 : 0.14,
        }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
      />
      <motion.span
        className={[styles.ring, styles[tone]].join(" ")}
        animate={{ scale: active ? 1 + energy * 0.18 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      />
      {active && !muted ? (
        <>
          <span className={[styles.pulse, styles[tone]].join(" ")} />
          <span className={[styles.pulse, styles.pulseDelay, styles[tone]].join(" ")} />
        </>
      ) : null}
      <motion.div
        className={[styles.core, styles[tone], muted ? styles.muted : ""].filter(Boolean).join(" ")}
        animate={{ scale: active ? 1 + energy * 0.08 : 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
      >
        <span className={styles.inner}>{children}</span>
      </motion.div>
    </div>
  );
};

interface WaveformProps {
  level: number;
  bars?: number;
  active?: boolean;
}

export const Waveform = ({ level, bars = 28, active = true }: WaveformProps) => (
  <div className={styles.waveform}>
    {Array.from({ length: bars }, (_, index) => {
      const center = Math.abs(index - bars / 2) / (bars / 2);
      const height = active ? 4 + level * 44 * (1 - center * 0.75) * (0.6 + Math.random() * 0.7) : 4;
      return (
        <motion.span
          key={index}
          className={styles.waveBar}
          animate={{ height: Math.max(4, Math.min(48, height)) }}
          transition={{ duration: 0.14, ease: "easeOut" }}
        />
      );
    })}
  </div>
);
