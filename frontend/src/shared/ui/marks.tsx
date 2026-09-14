import coinArt from "@/assets/currency/coin.webp";
import energyArt from "@/assets/currency/energy.webp";
import streakArt from "@/assets/currency/streak.webp";
import streakBlaze from "@/assets/streak/blaze.webp";
import streakEverburn from "@/assets/streak/everburn.webp";
import streakFlame from "@/assets/streak/flame.webp";
import streakSpark from "@/assets/streak/spark.webp";
import streakSteady from "@/assets/streak/steady.webp";

/**
 * The three things the economy is counted in. They are painted objects rather
 * than outline glyphs, so anywhere a figure is quoted shows the same coin,
 * bolt and flame the top bar shows, instead of a line icon standing in for it.
 */
const Mark = ({
  src,
  size,
  className = "",
}: {
  src: string;
  size: number;
  className?: string;
}) => (
  <img
    src={src}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    decoding="async"
    className={`inline-block shrink-0 object-contain ${className}`}
    style={{ width: size, height: size }}
  />
);

export const CoinMark = ({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) => <Mark src={coinArt} size={size} className={className} />;

export const EnergyMark = ({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) => <Mark src={energyArt} size={size} className={className} />;

export const StreakMark = ({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) => <Mark src={streakArt} size={size} className={className} />;

/**
 * The streak has no ceiling, so the flame is what carries how far you are
 * rather than a number that stops at seven. It grows from an ember to
 * something that burns a different colour.
 */
export const STREAK_TIERS = {
  spark: streakSpark,
  flame: streakFlame,
  steady: streakSteady,
  blaze: streakBlaze,
  everburn: streakEverburn,
} as const;

export type StreakTier = keyof typeof STREAK_TIERS;

export const StreakFlame = ({
  tier = "spark",
  size = 20,
  className,
}: {
  tier?: string;
  size?: number;
  className?: string;
}) => (
  <Mark
    src={STREAK_TIERS[(tier as StreakTier) in STREAK_TIERS ? (tier as StreakTier) : "spark"]}
    size={size}
    className={className}
  />
);
