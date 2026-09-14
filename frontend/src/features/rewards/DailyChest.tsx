import { AnimatePresence, m } from "motion/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { useT } from "@/shared/i18n";
import { spring } from "@/shared/lib/motion";
import type { WheelPrize } from "@/shared/lib/types";

import { CoinMark, CrownMark, EnergyMark } from "@/shared/ui/marks";

/** Frames of the rendered chest opening, in order. */
const FRAMES = Object.entries(
  import.meta.glob<string>("../../assets/tiles/chest/*.webp", {
    eager: true,
    import: "default",
  }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src);

const LAST = FRAMES.length - 1;
const FRAME_MS = 1000 / 24;

export interface DailyChestHandle {
  /** Plays the open and leaves the prize on screen until the next spin. */
  reveal: (prize: WheelPrize) => Promise<void>;
}

const KIND_ICON = {
  energy: EnergyMark,
  coins: CoinMark,
  premium: CrownMark,
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

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * A wheel was the wrong shape for this. Eight slices on a disc turn into a pie
 * chart, the labels will not fit inside them, and the prize ends up explained
 * in a legend somewhere else. A gift that opens says the same thing in one
 * gesture, and the prize lands where you are already looking.
 *
 * The open is a rendered frame sequence rather than a transform on a still,
 * because a lid swinging back is a shape change and no amount of scaling or
 * rotating a flat image will fake it. Every frame is in the document from the
 * first render so the browser has decoded all of them before the first tap,
 * and playback is a clock driven loop: a slow device drops frames instead of
 * stretching the open past the moment the prize should land.
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
  const [frame, setFrame] = useState(0);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const play = () =>
    new Promise<void>((done) => {
      if (reducedMotion()) {
        setFrame(LAST);
        done();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const index = Math.min(LAST, Math.floor((now - start) / FRAME_MS));
        setFrame(index);
        if (index >= LAST) {
          done();
          return;
        }
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    });

  useImperativeHandle(ref, () => ({
    reveal: async (prize) => {
      setWon(null);
      setFrame(0);
      await play();
      // The lid is fully back before the prize starts its own rise, so the two
      // read as one gesture rather than a cut.
      await new Promise((resolve) => setTimeout(resolve, 140));
      setWon(prize);
    },
  }));

  const open = frame > 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-[188px] w-full items-center justify-center">
        <m.div
          className="absolute size-[150px]"
          animate={
            won
              ? { opacity: 0, scale: 0.86 }
              : open
                ? { opacity: 1, scale: 1, y: 0 }
                : ready
                  ? { opacity: 1, scale: 1, y: [0, -7, 0] }
                  : { opacity: 1, scale: 1, y: 0 }
          }
          transition={
            won
              ? { duration: 0.28, ease: "easeOut" }
              : open
                ? { duration: 0.12 }
                : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
          }
        >
          {FRAMES.map((src, index) => (
            <img
              key={src}
              src={src}
              alt=""
              decoding="sync"
              className="absolute inset-0 size-full rounded-[36px] object-cover"
              style={{ opacity: index === frame ? 1 : 0 }}
            />
          ))}
        </m.div>

        <AnimatePresence>
          {won && (
            <m.div
              key="prize"
              className="relative flex flex-col items-center gap-2"
              initial={{ scale: 0.4, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={spring.soft}
            >
              {(() => {
                const Icon = KIND_ICON[won.kind];
                return (
                  <span className={KIND_TONE[won.kind]}>
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
