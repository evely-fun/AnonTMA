import { AnimatePresence, m } from "motion/react";
import { forwardRef, useImperativeHandle, useState } from "react";

import rewardsArt from "@/assets/tiles/rewards.webp";
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
  const [opening, setOpening] = useState(false);

  useImperativeHandle(ref, () => ({
    reveal: async (prize) => {
      setWon(null);
      setOpening(true);
      await new Promise((resolve) => setTimeout(resolve, 620));
      setOpening(false);
      setWon(prize);
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
              key="box"
              src={rewardsArt}
              alt=""
              className="size-[150px] rounded-[36px] object-cover"
              animate={
                opening
                  ? { scale: [1, 1.12, 0.94, 1.06], rotate: [0, -4, 4, 0] }
                  : ready
                    ? { y: [0, -7, 0] }
                    : { y: 0 }
              }
              transition={
                opening
                  ? { duration: 0.6, ease: "easeInOut" }
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
