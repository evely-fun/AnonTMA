import { useMemo } from "react";

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

interface AvatarProps {
  seed: string;
  size?: number;
  online?: boolean;
  speaking?: boolean;
  className?: string;
}

export const Avatar = ({ seed, size = 44, online, speaking, className = "" }: AvatarProps) => {
  const art = useMemo(() => {
    const base = hash(seed || "anon");
    const [from, to] = SHELLS[base % SHELLS.length];
    const angle = 25 + (base % 5) * 30;
    const glyph = base % 4;
    const offset = 6 + ((base >> 5) % 10);
    return { from, to, angle, glyph, offset };
  }, [seed]);

  const radius = Math.round(size * 0.34);
  const id = `av-${hash(seed)}`;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {speaking && (
        <span
          className="ping-ring pointer-events-none absolute -inset-1 rounded-[inherit] border-2 border-live"
          style={{ borderRadius: radius + 4 }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className="shadow-[inset_0_1px_0_oklch(1_0_0/0.14)]"
        style={{ borderRadius: radius }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={id} gradientTransform={`rotate(${art.angle})`}>
            <stop offset="0%" stopColor={art.from} />
            <stop offset="100%" stopColor={art.to} />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx={radius * (64 / size)} fill={`url(#${id})`} />
        {art.glyph === 0 && (
          <circle cx={32 + art.offset - 8} cy={30} r="15" fill="#fff" opacity="0.1" />
        )}
        {art.glyph === 1 && (
          <rect x={art.offset} y="34" width="52" height="26" rx="13" fill="#fff" opacity="0.1" />
        )}
        {art.glyph === 2 && (
          <path d={`M0 ${44 - art.offset} Q32 ${18 - art.offset} 64 ${44 - art.offset} L64 64 L0 64 Z`} fill="#fff" opacity="0.09" />
        )}
        {art.glyph === 3 && (
          <>
            <circle cx="20" cy="24" r="11" fill="#fff" opacity="0.09" />
            <circle cx="44" cy="42" r="14" fill="#fff" opacity="0.07" />
          </>
        )}
      </svg>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-live ring-[3px] ring-bg"
          style={{ width: Math.max(9, size * 0.24), height: Math.max(9, size * 0.24) }}
        />
      )}
    </span>
  );
};
