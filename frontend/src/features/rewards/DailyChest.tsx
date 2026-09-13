import { AnimatePresence, m } from "motion/react";
import { forwardRef, useImperativeHandle, useState } from "react";

import chestClosed from "@/assets/tiles/chest0.webp";
import chestAjar from "@/assets/tiles/chest1.webp";
import chestOpen from "@/assets/tiles/chest2.webp";
import { useT } from "@/shared/i18n";
import { spring } from "@/shared/lib/motion";
import type { WheelPrize } from "@/shared/lib/types";
import { BoltIcon, CoinIcon, CrownIcon } from "@/shared/ui/icons";

export interface DailyChestHandle {
  /** Plays the open and leaves the prize on screen until the next spin. */
  reveal: (prize: WheelPrize) => Promise<void>;
}

const KIND_ICON = {
  energy: BoltIcon,
  coins: CoinIcon,
  premium: CrownIcon,
} as const;

const KIND_TONE = {
  energy: "text-warn",
  coins: "text-live",
  premium: "text-accent",
} as const;

const prizeLabel = (prize: WheelPrize, t: (key: string) => string): string => {
  if (prize.kind === "premium") {
    return `${prize.amount} ${t("economy.premiumDaysShort")}`;
  }
  return String(prize.amount);
};

/**
 * A wheel was the wrong shape for this. Eight slices on a disc turn into a pie
 * chart, the labels will not fit inside them, and the prize ends up explained
 * in a legend somewhere else. A gift that opens says the same thing in one
 * gesture, and the prize lands where you are already looking.
 *
 * The server picks the prize before anything animates, so there is no choice
 * being faked here: the box only plays back a result that already exists.
 */
export const DailyChest = forwardRef<
  DailyChestHandle,
  { prizes: WheelPrize[]; ready: boolean }
>(({ prizes, ready }, ref) => {
  const { t } = useT();
  const [won, setWon] = useState<WheelPrize | null>(null);
  // Three drawn states of the same chest. Cross fading between them reads as
  // a lid actually lifting, which a single image cannot do however it is
  // scaled or rotated.
  const [frame, setFrame] = useState<0 | 1 | 2>(0);
  const opening = frame > 0;

  useImperativeHandle(ref, () => ({
    reveal: async (prize) => {
      setWon(null);
      setFrame(1);
      await new Promise((resolve) => setTimeout(resolve, 320));
      setFrame(2);
      await new Promise((resolve) => setTimeout(resolve, 620));
      setWon(prize);
      setFrame(0);
    },
  }));

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-[188px] w-full items-center justify-center">
        <AnimatePresence mode="wait">
          {won ? (
            <m.div
              key="prize"
              className="flex flex-col items-center gap-2"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={spring.snappy}
            >
              {(() => {
                const Icon = KIND_ICON[won.kind];
                return (
                  <span className={`${KIND_TONE[won.kind]}`}>
                    <Icon size={46} />
                  </span>
                );
              })()}
              <span className="font-display text-[40px] font-extrabold leading-none tabular">
                +{prizeLabel(won, t)}
              </span>
              <span className="text-[13px] text-secondary">
                {t(`economy.prizeKind.${won.kind}`)}
              </span>
            </m.div>
          ) : (
            <m.img
              key={`box-${frame}`}
              src={[chestClosed, chestAjar, chestOpen][frame]}
              alt=""
              className="size-[150px] rounded-[36px] object-cover"
              initial={opening ? { opacity: 0, scale: 0.96 } : false}
              animate={
                opening
                  ? { opacity: 1, scale: frame === 2 ? 1.08 : 1.02 }
                  : ready
                    ? { opacity: 1, y: [0, -7, 0] }
                    : { opacity: 1, y: 0 }
              }
              transition={
                opening
                  ? { duration: 0.22, ease: "easeOut" }
                  : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
              }
            />
          )}
        </AnimatePresence>
      </div>

      {/* What can come out of it, stated plainly instead of hidden in slices. */}
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {(["energy", "coins", "premium"] as const).map((kind) => {
          const amounts = prizes
            .filter((prize) => prize.kind === kind)
            .map((prize) => prize.amount);
          if (amounts.length === 0) {
            return null;
          }
          const Icon = KIND_ICON[kind];
          return (
            <span
              key={kind}
              className="flex items-center gap-1.5 text-[12.5px] text-secondary tabular"
            >
              <span className={KIND_TONE[kind]}>
                <Icon size={14} />
              </span>
              {amounts.join(" · ")}
              {kind === "premium" && ` ${t("economy.premiumDaysShort")}`}
            </span>
          );
        })}
      </div>
    </div>
  );
});

DailyChest.displayName = "DailyChest";
