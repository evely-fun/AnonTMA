import type { ReactNode } from "react";

export const GameStatus = ({
  eyebrow,
  title,
  seconds,
  trailing,
}: {
  eyebrow: string;
  title: string;
  seconds?: number;
  trailing?: ReactNode;
}) => (
  <div className="panel flex items-center justify-between gap-3 rounded-[18px] px-4 py-3.5">
    <div className="min-w-0">
      <span className="block font-display text-[10.5px] font-bold tracking-[0.01em] text-hint">
        {eyebrow}
      </span>
      <span className="mt-0.5 block truncate font-display text-[16px] font-extrabold tracking-[-0.02em]">
        {title}
      </span>
    </div>
    {seconds !== undefined && seconds > 0 && (
      <span className="shrink-0 rounded-full bg-elevated px-3 py-1.5 font-display text-[14px] font-extrabold tabular">
        {seconds}
      </span>
    )}
    {trailing}
  </div>
);

export const ScoreRow = ({
  items,
}: {
  items: { value: ReactNode; label: string; tone?: "label" | "accent" | "live" }[];
}) => (
  <div className="flex items-center justify-center gap-7">
    {items.map((item, index) => (
      <div key={index} className="flex flex-col items-center gap-0.5">
        <span
          className={`font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular ${
            item.tone === "accent"
              ? "text-accent"
              : item.tone === "live"
                ? "text-live"
                : "text-label"
          }`}
        >
          {item.value}
        </span>
        <span className="font-display text-[10px] font-bold tracking-[0.01em] text-hint">
          {item.label}
        </span>
      </div>
    ))}
  </div>
);

export const WordCard = ({ label, value }: { label: string; value: string }) => (
  <div className="panel-hero flex flex-col items-center gap-1.5 rounded-[22px] px-5 py-7 text-center">
    <span className="font-display text-[10.5px] font-bold tracking-[0.01em] text-hint">
      {label}
    </span>
    <span className="font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em]">
      {value}
    </span>
  </div>
);
