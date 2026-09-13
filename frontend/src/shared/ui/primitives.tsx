import { m, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";

import statChats from "@/assets/stats/chats.webp";
import statGames from "@/assets/stats/games.webp";
import statLikes from "@/assets/stats/likes.webp";
import statRating from "@/assets/stats/rating.webp";
import statStreak from "@/assets/stats/streak.webp";
import statVoice from "@/assets/stats/voice.webp";
import { haptic } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

import { CheckIcon, ChevronIcon } from "./icons";

export const SectionHead = ({
  title,
  trailing,
  note,
}: {
  title: string;
  trailing?: ReactNode;
  note?: string;
}) => (
  <div className="mb-3 flex items-end justify-between gap-3 px-5">
    <div>
      <h2 className="font-display text-[12px] font-extrabold tracking-[0.01em] text-hint">
        {title}
      </h2>
      {note && <p className="mt-1 text-[12.5px] text-secondary">{note}</p>}
    </div>
    {trailing}
  </div>
);

export const IconTile = ({
  children,
  tone = "neutral",
  size = 38,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "live" | "warn" | "danger";
  size?: number;
}) => {
  const tones = {
    neutral: "bg-elevated text-secondary",
    accent: "bg-accent-quiet text-accent",
    live: "bg-live-quiet text-live",
    warn: "bg-warn/15 text-warn",
    danger: "bg-destructive-quiet text-destructive",
  };
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[12px] ${tones[tone]}`}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
};

export const ListRow = ({
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  onClick,
  disabled,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) => {
  const content = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] font-bold leading-tight tracking-[-0.01em] text-label">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[12.5px] text-hint">{subtitle}</span>
        )}
      </span>
      {trailing && <span className="shrink-0 text-[12.5px] font-semibold">{trailing}</span>}
      {chevron && <ChevronIcon size={16} className="shrink-0 text-hint/60" />}
    </>
  );

  if (!onClick) {
    return <div className="flex w-full items-center gap-3.5 px-4 py-3.5">{content}</div>;
  }

  return (
    <m.button
      type="button"
      disabled={disabled}
      onPointerDown={() => haptic.select()}
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      transition={spring.snappy}
      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-elevated/60 disabled:opacity-40 [@media(hover:hover)]:hover:bg-elevated/40"
    >
      {content}
    </m.button>
  );
};

export const Panel = ({
  children,
  className = "",
  divided,
}: {
  children: ReactNode;
  className?: string;
  divided?: boolean;
}) => (
  <div
    className={`panel mx-4 overflow-hidden rounded-[20px] ${
      divided ? "divide-y divide-separator" : ""
    } ${className}`}
  >
    {children}
  </div>
);

export const AnimatedNumber = ({ value }: { value: number }) => {
  const source = useMotionValue(value);
  const smooth = useSpring(source, { stiffness: 90, damping: 20, mass: 0.6 });
  const text = useTransform(smooth, (current) =>
    Math.round(current).toLocaleString("en-US"),
  );

  useEffect(() => {
    source.set(value);
  }, [value, source]);

  return <m.span>{text}</m.span>;
};

export const Chip = ({
  children,
  active,
  onClick,
  tone = "neutral",
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "accent" | "live" | "danger";
}) => {
  const tones = {
    neutral: "bg-elevated text-secondary",
    accent: "bg-accent-quiet text-accent",
    live: "bg-live-quiet text-live",
    danger: "bg-destructive-quiet text-destructive",
  };
  const classes = `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-display text-[12px] font-bold tracking-[-0.01em] transition-colors ${
    active ? "bg-label text-bg" : tones[tone]
  }`;

  if (!onClick) {
    return <span className={classes}>{children}</span>;
  }

  return (
    <m.button
      type="button"
      onPointerDown={() => haptic.select()}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={spring.snappy}
      className={classes}
    >
      {children}
    </m.button>
  );
};

/** The drawn ground each number stands on, one per figure. */
const STAT_ART = {
  chats: statChats,
  voice: statVoice,
  games: statGames,
  likes: statLikes,
  streak: statStreak,
  rating: statRating,
} as const;

export type StatArt = keyof typeof STAT_ART;

/**
 * A number on a soft painted ground rather than a white card with a grey glyph
 * on top of it. Six identical cards each wearing a different outline icon read
 * as a settings list; this reads as a set of figures worth looking at.
 */
export const StatTile = ({
  value,
  label,
  art,
}: {
  value: ReactNode;
  label: string;
  art: StatArt;
}) => (
  <div className="relative flex aspect-[5/4] flex-col items-center justify-center overflow-hidden rounded-[18px]">
    <img
      src={STAT_ART[art]}
      alt=""
      loading="lazy"
      decoding="async"
      className="absolute inset-0 size-full object-cover"
    />
    <span className="relative font-display text-[24px] font-extrabold leading-none tracking-[-0.03em] text-label tabular">
      {value}
    </span>
    <span className="relative mt-1.5 text-[12px] text-secondary">{label}</span>
  </div>
);

export const Meter = ({
  ratio,
  tone = "accent",
  height = 6,
}: {
  ratio: number;
  tone?: "accent" | "live" | "warn";
  height?: number;
}) => {
  const fills = {
    accent: "bg-accent",
    live: "bg-live",
    warn: "bg-warn",
  };
  return (
    <div
      className="meter-track w-full overflow-hidden rounded-full bg-elevated"
      style={{ height }}
      role="progressbar"
    >
      <m.span
        className={`block h-full rounded-full ${fills[tone]}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      />
    </div>
  );
};

export const EmptyState = ({
  icon,
  art,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  /** An illustration says more than a grey glyph on an empty screen. */
  art?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <m.div
    className="flex flex-col items-center justify-center gap-2 px-10 py-14 text-center"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
  >
    {art ? (
      <img
        src={art}
        alt=""
        loading="lazy"
        decoding="async"
        className="mb-3 size-[136px] rounded-[32px] object-cover"
      />
    ) : (
      <span className="mb-2 flex size-14 items-center justify-center rounded-[18px] bg-elevated text-hint">
        {icon}
      </span>
    )}
    <h3 className="font-display text-[17px] font-extrabold tracking-[-0.02em]">{title}</h3>
    {description && (
      <p className="max-w-[280px] text-[13.5px] leading-snug text-hint">{description}</p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </m.div>
);

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`skeleton rounded-[16px] ${className}`} />
);

/**
 * `grouped` drops the row's own card so a set of mutually exclusive choices can
 * sit inside one Panel. Four options that are really one question should not
 * look like four unrelated things stacked on top of each other.
 */
export const OptionRow = ({
  title,
  subtitle,
  active,
  muted,
  grouped,
  trailing,
  onClick,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  muted?: boolean;
  grouped?: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
}) => (
  <m.button
    type="button"
    onClick={onClick}
    whileTap={{ scale: grouped ? 1 : 0.985 }}
    transition={spring.snappy}
    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
      grouped ? "" : "rounded-[16px]"
    } ${active ? "bg-accent-quiet" : grouped ? "" : "panel"} ${muted ? "opacity-55" : ""}`}
  >
    <span className="min-w-0 flex-1">
      <span
        className={`block font-display text-[14.5px] font-bold tracking-[-0.01em] ${
          active ? "text-accent" : "text-label"
        }`}
      >
        {title}
      </span>
      {subtitle && <span className="mt-0.5 block text-[12px] leading-snug text-hint">{subtitle}</span>}
    </span>
    {trailing}
    {active && !trailing && (
      <span className="text-accent">
        <CheckIcon size={17} />
      </span>
    )}
  </m.button>
);

export const Pill = ({
  children,
  tone = "neutral",
  onClick,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "live";
  onClick?: () => void;
}) => {
  const tones = {
    neutral: "bg-elevated text-label",
    accent: "bg-accent-quiet text-accent",
    warn: "bg-warn/15 text-warn",
    live: "bg-live-quiet text-live",
  };
  const classes = `flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-display text-[12.5px] font-bold tabular ${tones[tone]}`;
  if (!onClick) return <span className={classes}>{children}</span>;
  return (
    <m.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={spring.snappy}
      className={classes}
    >
      {children}
    </m.button>
  );
};
