import { motion } from "framer-motion";

import styles from "./Progress.module.css";

interface ProgressBarProps {
  ratio: number;
  label?: string;
  hint?: string;
  tone?: "accent" | "mint" | "amber";
}

export const ProgressBar = ({ ratio, label, hint, tone = "accent" }: ProgressBarProps) => (
  <div className={styles.bar}>
    {label || hint ? (
      <div className={styles.barHeader}>
        {label ? <span className={styles.barLabel}>{label}</span> : null}
        {hint ? <span className={styles.barHint}>{hint}</span> : null}
      </div>
    ) : null}
    <div className={styles.track}>
      <motion.span
        className={[styles.fill, styles[tone]].join(" ")}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
        transition={{ type: "spring", stiffness: 180, damping: 26 }}
      />
    </div>
  </div>
);

interface LevelRingProps {
  level: number;
  ratio: number;
  size?: number;
  title?: string;
}

export const LevelRing = ({ level, ratio, size = 92, title }: LevelRingProps) => {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6C8CFF" />
            <stop offset="55%" stopColor="#9C6CFF" />
            <stop offset="100%" stopColor="#FF6CA8" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - Math.min(1, Math.max(0, ratio))) }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={styles.ringContent}>
        <span className={styles.ringLevel}>{level}</span>
        <span className={styles.ringTitle}>{title ?? "level"}</span>
      </div>
    </div>
  );
};
