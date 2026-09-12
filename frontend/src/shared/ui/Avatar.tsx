import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import {
  defaultStyleFor,
  isStyleReady,
  loadStyle,
  renderAvatar,
  type AvatarStyle,
} from "@/shared/lib/avatars";

export type AvatarFrame = "none" | "halo" | "pulse" | "orbit" | "ember" | "gilded";

const SHELLS: [string, string][] = [
  ["#1d4f86", "#0d2647"],
  ["#1a5f72", "#0c2b36"],
  ["#2b4a7d", "#111f3a"],
  ["#265f5a", "#0e2a28"],
  ["#3d4a7a", "#161c33"],
  ["#1f5a9c", "#0b2540"],
  ["#4a4470", "#1a1830"],
  ["#175e63", "#0a2a2c"],
];

const hash = (value: string): number => {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return Math.abs(output);
};

const FRAME_RING: Record<AvatarFrame, string> = {
  none: "",
  halo: "shadow-[0_0_0_2px_var(--color-accent)]",
  pulse: "shadow-[0_0_0_2px_var(--color-live)]",
  orbit: "shadow-[0_0_0_2px_var(--color-accent),0_0_0_5px_var(--accent-soft)]",
  ember: "shadow-[0_0_0_2px_var(--color-warn)]",
  gilded: "shadow-[0_0_0_2px_oklch(0.85_0.14_88),0_0_14px_-2px_oklch(0.85_0.14_88/0.6)]",
};

interface AvatarProps {
  seed: string;
  size?: number;
  online?: boolean;
  speaking?: boolean;
  style?: string;
  frame?: string;
  gender?: string;
  className?: string;
}

const Geometric = ({ seed, size, radius }: { seed: string; size: number; radius: number }) => {
  const art = useMemo(() => {
    const base = hash(seed || "anon");
    const [from, to] = SHELLS[base % SHELLS.length];
    return {
      from,
      to,
      angle: 25 + (base % 5) * 30,
      glyph: base % 4,
      offset: 6 + ((base >> 5) % 10),
      id: `av-${base}`,
    };
  }, [seed]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ borderRadius: radius }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={art.id} gradientTransform={`rotate(${art.angle})`}>
          <stop offset="0%" stopColor={art.from} />
          <stop offset="100%" stopColor={art.to} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={radius * (64 / size)} fill={`url(#${art.id})`} />
      {art.glyph === 0 && <circle cx={32 + art.offset - 8} cy={30} r="15" fill="#fff" opacity="0.1" />}
      {art.glyph === 1 && (
        <rect x={art.offset} y="34" width="52" height="26" rx="13" fill="#fff" opacity="0.1" />
      )}
      {art.glyph === 2 && (
        <path
          d={`M0 ${44 - art.offset} Q32 ${18 - art.offset} 64 ${44 - art.offset} L64 64 L0 64 Z`}
          fill="#fff"
          opacity="0.09"
        />
      )}
      {art.glyph === 3 && (
        <>
          <circle cx="20" cy="24" r="11" fill="#fff" opacity="0.09" />
          <circle cx="44" cy="42" r="14" fill="#fff" opacity="0.07" />
        </>
      )}
    </svg>
  );
};

export const Avatar = ({
  seed,
  size = 44,
  online,
  speaking,
  style,
  frame = "none",
  gender,
  className = "",
}: AvatarProps) => {
  const resolved = (style || (gender ? defaultStyleFor(gender) : "geometric")) as AvatarStyle;
  const [ready, setReady] = useState(() => isStyleReady(resolved));

  useEffect(() => {
    if (isStyleReady(resolved)) {
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    void loadStyle(resolved).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [resolved]);

  const markup = useMemo(
    () => (ready ? renderAvatar(resolved, seed || "anon") : null),
    [ready, resolved, seed],
  );

  const radius = Math.round(size * 0.34);
  const ring = FRAME_RING[(frame as AvatarFrame) ?? "none"] ?? "";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {speaking && (
        <m.span
          className="pointer-events-none absolute -inset-1 rounded-full border-2 border-live"
          initial={{ scale: 0.86, opacity: 0.7 }}
          animate={{ scale: 1.18, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      {frame === "pulse" && (
        <m.span
          className="pointer-events-none absolute -inset-1 rounded-full border border-live/70"
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span
        className={`overflow-hidden ${ring}`}
        style={{ width: size, height: size, borderRadius: markup ? size : radius }}
      >
        {markup ? (
          <span
            className="block size-full"
            // DiceBear renders a static SVG string from a seed, no external input
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        ) : (
          <Geometric seed={seed} size={size} radius={radius} />
        )}
      </span>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-live ring-[3px] ring-bg"
          style={{ width: Math.max(9, size * 0.24), height: Math.max(9, size * 0.24) }}
        />
      )}
    </span>
  );
};
