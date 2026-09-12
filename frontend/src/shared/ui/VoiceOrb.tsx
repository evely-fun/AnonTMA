import { m } from "motion/react";
import type { ReactNode } from "react";

const TICKS = 56;

export const VoiceOrb = ({
  level,
  size = 220,
  muted = false,
  tone = "accent",
  children,
  pulse = true,
}: {
  level: number;
  size?: number;
  muted?: boolean;
  tone?: "accent" | "live" | "warn";
  children?: ReactNode;
  pulse?: boolean;
}) => {
  const energy = muted ? 0 : Math.min(1, Math.max(0, level));
  const lit = Math.round(energy * TICKS);
  const colors = {
    accent: { ring: "var(--color-accent)", glow: "oklch(0.72 0.115 236 / 0.3)" },
    live: { ring: "var(--color-live)", glow: "oklch(0.8 0.15 150 / 0.26)" },
    warn: { ring: "var(--color-warn)", glow: "oklch(0.83 0.17 78 / 0.26)" },
  }[tone];

  const center = 100;
  const inner = 78;
  const outer = 92;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <m.span
        className="pointer-events-none absolute inset-[14%] rounded-full blur-2xl"
        style={{ background: colors.glow }}
        animate={{ opacity: muted ? 0.16 : 0.35 + energy * 0.5, scale: 1 + energy * 0.12 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}
      />

      {pulse && !muted && (
        <span
          className="ping-ring pointer-events-none absolute inset-[18%] rounded-full border"
          style={{ borderColor: colors.ring, opacity: 0.35 }}
        />
      )}

      <svg viewBox="0 0 200 200" width={size} height={size} className="relative">
        <circle
          cx={center}
          cy={center}
          r={outer - 2}
          fill="none"
          stroke="oklch(1 0 0 / 0.06)"
          strokeWidth="1"
        />
        {Array.from({ length: TICKS }, (_, index) => {
          const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
          const active = index < lit;
          const x1 = center + Math.cos(angle) * inner;
          const y1 = center + Math.sin(angle) * inner;
          const x2 = center + Math.cos(angle) * (active ? outer : inner + 5);
          const y2 = center + Math.sin(angle) * (active ? outer : inner + 5);
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={active ? colors.ring : "oklch(1 0 0 / 0.12)"}
              strokeWidth={active ? 2.6 : 1.6}
              strokeLinecap="round"
              style={{ transition: "stroke 120ms linear" }}
            />
          );
        })}
      </svg>

      <m.div
        className="absolute flex items-center justify-center rounded-full bg-elevated text-label shadow-[inset_0_1px_0_oklch(1_0_0/0.14)]"
        style={{ width: size * 0.52, height: size * 0.52 }}
        animate={{ scale: muted ? 0.96 : 1 + energy * 0.05 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
      >
        {children}
      </m.div>
    </div>
  );
};

export const LevelBars = ({ level, bars = 24 }: { level: number; bars?: number }) => (
  <div className="flex h-8 items-center justify-center gap-[3px]">
    {Array.from({ length: bars }, (_, index) => {
      const distance = Math.abs(index - (bars - 1) / 2) / ((bars - 1) / 2);
      const height = 4 + level * 28 * (1 - distance * 0.7);
      return (
        <m.span
          key={index}
          className="w-[3px] rounded-full bg-accent"
          animate={{ height: Math.max(4, Math.min(32, height)) }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        />
      );
    })}
  </div>
);
