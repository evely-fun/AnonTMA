import coinArt from "@/assets/currency/coin.webp";
import energyArt from "@/assets/currency/energy.webp";
import streakArt from "@/assets/currency/streak.webp";

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
