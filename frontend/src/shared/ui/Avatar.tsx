import { motion } from "framer-motion";
import { useMemo } from "react";

import styles from "./Avatar.module.css";

const PALETTES: Record<string, [string, string, string]> = {
  aurora: ["#6C8CFF", "#9C6CFF", "#3FBF8F"],
  sunset: ["#FF8A5B", "#FF6CA8", "#F2A33C"],
  ocean: ["#3FBF8F", "#37B6D9", "#6C8CFF"],
  ember: ["#E0514C", "#F2A33C", "#FF6CA8"],
  violet: ["#9C6CFF", "#6C8CFF", "#FF6CA8"],
  mint: ["#3FBF8F", "#8BE0B4", "#37B6D9"],
  peach: ["#FFB08A", "#FF6CA8", "#F2A33C"],
  storm: ["#5C6C8A", "#6C8CFF", "#37B6D9"],
};

const PALETTE_KEYS = Object.keys(PALETTES);

const hash = (value: string): number => {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return Math.abs(output);
};

interface AvatarProps {
  seed: string;
  size?: number;
  online?: boolean;
  speaking?: boolean;
  level?: number;
  ring?: boolean;
}

export const Avatar = ({ seed, size = 48, online, speaking, level, ring = false }: AvatarProps) => {
  const visuals = useMemo(() => {
    const base = hash(seed || "anon");
    const palette = PALETTES[PALETTE_KEYS[base % PALETTE_KEYS.length]] ?? PALETTES.aurora;
    const rotation = base % 360;
    const shape = base % 6;
    const dots = Array.from({ length: 5 }, (_, index) => {
      const local = hash(`${seed}:${index}`);
      return {
        x: 14 + (local % 72),
        y: 14 + ((local >> 6) % 72),
        r: 4 + ((local >> 12) % 12),
        opacity: 0.14 + ((local >> 18) % 26) / 100,
      };
    });
    return { palette, rotation, shape, dots };
  }, [seed]);

  return (
    <div className={styles.wrapper} style={{ width: size, height: size }}>
      {speaking ? <span className={styles.pulse} /> : null}
      <motion.div
        className={[styles.avatar, ring ? styles.ring : ""].filter(Boolean).join(" ")}
        style={{
          width: size,
          height: size,
          borderRadius: visuals.shape < 3 ? "50%" : `${Math.round(size * 0.32)}px`,
        }}
        animate={speaking ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={{ duration: 1.1, repeat: speaking ? Infinity : 0, ease: "easeInOut" }}
      >
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
          <defs>
            <linearGradient id={`grad-${seed}`} gradientTransform={`rotate(${visuals.rotation})`}>
              <stop offset="0%" stopColor={visuals.palette[0]} />
              <stop offset="60%" stopColor={visuals.palette[1]} />
              <stop offset="100%" stopColor={visuals.palette[2]} />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#grad-${seed})`} />
          {visuals.dots.map((dot, index) => (
            <circle
              key={index}
              cx={dot.x}
              cy={dot.y}
              r={dot.r}
              fill="#ffffff"
              opacity={dot.opacity}
            />
          ))}
        </svg>
      </motion.div>
      {online ? <span className={styles.presence} /> : null}
      {level ? <span className={styles.level}>{level}</span> : null}
    </div>
  );
};
