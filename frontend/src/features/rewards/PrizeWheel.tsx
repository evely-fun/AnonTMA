import { useEffect, useRef } from "react";
import { Wheel } from "spin-wheel";

import { roleColours, withAlpha } from "@/shared/lib/theme";
import type { WheelPrize } from "@/shared/lib/types";

export interface PrizeWheelHandle {
  spinTo: (index: number) => Promise<void>;
}

// Decelerates late, so the final segments tick past slowly instead of snapping.
const easeOutQuint = (n: number): number => 1 - (1 - n) ** 5;

export const PrizeWheel = ({
  prizes,
  handleRef,
  onRest,
  spins,
  spinsLabel,
  size = 264,
}: {
  prizes: WheelPrize[];
  handleRef: { current: PrizeWheelHandle | null };
  onRest?: () => void;
  spins: number;
  spinsLabel: string;
  size?: number;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const restRef = useRef(onRest);
  restRef.current = onRest;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || prizes.length === 0) return;

    const colours = roleColours();
    // A translucent segment sinks into paper. The light theme needs the tone
    // carried much closer to full strength to read as a wheel at all.
    const light = (document.documentElement.dataset.theme ?? "dark") === "light";
    const strong = light ? 0.72 : 0.3;
    const soft = light ? 0.42 : 0.16;
    const toneOf = (prize: WheelPrize): string =>
      prize.kind === "premium"
        ? colours.accent
        : prize.kind === "energy"
          ? colours.warn
          : colours.live;

    const wheel = new Wheel(host, {
      // Labels rotate with the wheel and read upside down on one side, so the
      // segments stay clean colour and the prizes are named in a legend below.
      items: prizes.map((prize, index) => ({
        backgroundColor: withAlpha(toneOf(prize), index % 2 === 0 ? strong : soft),
      })),
      radius: 0.94,
      lineWidth: 1,
      lineColor: withAlpha(colours.ink, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(colours.ink, 0.1),
      isInteractive: false,
      rotationResistance: -40,
      pointerAngle: 0,
    });

    handleRef.current = {
      spinTo: (index: number) =>
        new Promise<void>((resolve) => {
          wheel.onRest = () => {
            restRef.current?.();
            resolve();
          };
          wheel.spinToItem(index, 3800, true, 4, 1, easeOutQuint);
        }),
    };

    return () => {
      handleRef.current = null;
      wheel.remove();
    };
  }, [prizes, handleRef]);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div ref={hostRef} className="size-full" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex size-[92px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full bg-surface shadow-[0_0_0_1px_var(--color-separator),inset_0_1px_0_var(--sheen)]">
        <span
          className={`font-display text-[26px] font-extrabold leading-none tracking-[-0.04em] tabular ${
            spins > 0 ? "text-accent" : "text-hint"
          }`}
        >
          {spins}
        </span>
        <span className="font-display text-[9px] font-bold tracking-[0.01em] text-hint">
          {spinsLabel}
        </span>
      </span>
      <span className="pointer-events-none absolute left-1/2 top-[-3px] z-20 block size-0 -translate-x-1/2 border-x-[8px] border-t-[15px] border-x-transparent border-t-accent" />
    </div>
  );
};
