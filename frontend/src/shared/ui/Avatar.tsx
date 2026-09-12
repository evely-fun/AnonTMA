import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import {
  defaultStyleFor,
  isStyleReady,
  loadStyle,
  renderAvatar,
  type AvatarStyle,
} from "@/shared/lib/avatars";

const FRAME_KEYS = ["none", "halo", "pulse", "orbit", "ember", "gilded"] as const;
export type AvatarFrame = (typeof FRAME_KEYS)[number];

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

const EMBER_SPARKS = [
  { left: "18%", delay: "0s" },
  { left: "48%", delay: "0.8s" },
  { left: "76%", delay: "1.6s" },
];

/** Each frame is its own layer so the five of them read differently. */
const FrameLayer = ({ frame }: { frame: AvatarFrame }) => {
  if (frame === "none") {
    return null;
  }
  if (frame === "halo") {
    return (
      <>
        <span className="frame-ring frame-halo-glow" />
        <span className="frame-ring frame-halo" />
      </>
    );
  }
  if (frame === "pulse") {
    return (
      <>
        <span className="frame-ring frame-pulse-ring" />
        <m.span
          className="frame-ring frame-pulse-ring"
          animate={{ scale: [1, 1.22, 1], opacity: [0.75, 0, 0.75] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </>
    );
  }
  if (frame === "orbit") {
    return (
      <>
        <span className="frame-ring frame-orbit-ring" />
        <span className="frame-orbit-arm" />
      </>
    );
  }
  if (frame === "ember") {
    return (
      <>
        <span className="frame-ring frame-ember-ring" />
        {EMBER_SPARKS.map((spark) => (
          <span
            key={spark.left}
            className="frame-ember-spark"
            style={{ left: spark.left, animationDelay: spark.delay }}
          />
        ))}
      </>
    );
  }
  return <span className="frame-ring frame-gilded" />;
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

const Geometric = ({ seed, size }: { seed: string; size: number }) => {
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
      style={{ borderRadius: size }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={art.id} gradientTransform={`rotate(${art.angle})`}>
          <stop offset="0%" stopColor={art.from} />
          <stop offset="100%" stopColor={art.to} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="32" fill={`url(#${art.id})`} />
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

  const layer = (FRAME_KEYS as readonly string[]).includes(frame) ? (frame as AvatarFrame) : "none";

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
      <FrameLayer frame={layer} />
      <span
        className="overflow-hidden"
        style={{ width: size, height: size, borderRadius: size }}
      >
        {markup ? (
          <span
            className="block size-full"
            // DiceBear renders a static SVG string from a seed, no external input
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        ) : (
          <Geometric seed={seed} size={size} />
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
