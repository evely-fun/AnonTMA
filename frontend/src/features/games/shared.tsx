import { m } from "motion/react";
import type { ReactNode } from "react";

import { spring } from "@/shared/lib/motion";

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
      <span className="block text-[12px] text-hint">{eyebrow}</span>
      <span className="mt-0.5 block truncate font-display text-[16px] font-extrabold tracking-[-0.02em]">
        {title}
      </span>
    </div>
    {seconds !== undefined && seconds > 0 && <Countdown seconds={seconds} />}
    {trailing}
  </div>
);

/** Runs out of colour as it runs out of time, so the clock is felt rather than read. */
export const Countdown = ({ seconds }: { seconds: number }) => (
  <span
    className={`shrink-0 rounded-full px-3 py-1.5 font-display text-[14px] font-extrabold tabular ${
      seconds <= 5 ? "bg-destructive-quiet text-destructive" : "bg-elevated"
    }`}
  >
    {seconds}
  </span>
);

/**
 * Two sides facing each other with the thing they are playing for between
 * them. A plain row of equal numbers reads as a list of scores where the
 * target looks like a third player.
 */
export const Versus = ({
  left,
  right,
  middleLabel,
  middleValue,
}: {
  left: { name: string; badge: ReactNode; score: ReactNode; active?: boolean };
  right: { name: string; badge: ReactNode; score: ReactNode; active?: boolean };
  middleLabel: string;
  middleValue?: ReactNode;
}) => (
  <div className="flex items-center justify-center gap-4">
    <Corner {...left} />
    <div className="flex w-[90px] shrink-0 flex-col items-center gap-1">
      <span className="text-center text-[11.5px] leading-tight text-hint">{middleLabel}</span>
      {middleValue !== undefined && (
        <span className="font-display text-[20px] font-extrabold leading-none tabular">
          {middleValue}
        </span>
      )}
    </div>
    <Corner {...right} />
  </div>
);

const Corner = ({
  name,
  badge,
  score,
  active = false,
}: {
  name: string;
  badge: ReactNode;
  score: ReactNode;
  active?: boolean;
}) => (
  <m.div
    className="flex flex-1 flex-col items-center gap-1.5 px-2 py-3"
    animate={{ opacity: active ? 1 : 0.5 }}
    transition={{ duration: 0.25 }}
  >
    <m.span
      className={`flex size-9 items-center justify-center rounded-[12px] font-display text-[16px] font-extrabold ${
        active ? "bg-accent-quiet" : "bg-elevated"
      }`}
      animate={{ scale: active ? 1.08 : 1 }}
      transition={spring.snappy}
    >
      {badge}
    </m.span>
    <span className="max-w-full truncate text-[12px] text-secondary">{name}</span>
    <span className="font-display text-[22px] font-extrabold leading-none tabular">{score}</span>
  </m.div>
);

/**
 * The word is the whole game, so it gets the room. Everything else on the
 * card is there to say what to do with it.
 */
export const WordCard = ({ label, value }: { label: string; value: string }) => (
  <div className="panel-hero flex flex-col items-center gap-2 rounded-[24px] px-5 py-8 text-center">
    <span className="text-[12px] text-hint">{label}</span>
    <span className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.035em]">
      {value}
    </span>
  </div>
);
