import { m } from "motion/react";
import { useMemo } from "react";
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
    accent: {
      ring: "var(--color-accent)",
      glow: "oklch(0.72 var(--accent-chroma) var(--accent-hue) / 0.3)",
    },
    live: { ring: "var(--color-live)", glow: "oklch(0.8 0.15 150 / 0.26)" },
    warn: { ring: "var(--color-warn)", glow: "oklch(0.83 0.17 78 / 0.26)" },
  }[tone];

  const center = 100;
  const inner = 78;
  const outer = 92;

  const ticks = useMemo(
    () =>
      Array.from({ length: TICKS }, (_, index) => {
        const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
        const active = index < lit;
        const reach = active ? outer : inner + 5;
        return (
          <line
            key={index}
            x1={center + Math.cos(angle) * inner}
            y1={center + Math.sin(angle) * inner}
            x2={center + Math.cos(angle) * reach}
            y2={center + Math.sin(angle) * reach}
            stroke={active ? colors.ring : "var(--color-separator)"}
            strokeWidth={active ? 2.6 : 1.6}
            strokeLinecap="round"
          />
        );
      }),
    [lit, colors.ring, center, inner, outer],
  );

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
          stroke="var(--color-separator)"
          strokeWidth="1"
        />
        {ticks}
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
      const reach = Math.max(0.12, Math.min(1, (4 + level * 28 * (1 - distance * 0.7)) / 32));
      return (
        <m.span
          key={index}
          className="h-8 w-[3px] origin-center rounded-full bg-accent"
          style={{ willChange: "transform" }}
          animate={{ scaleY: reach }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        />
      );
    })}
  </div>
);
