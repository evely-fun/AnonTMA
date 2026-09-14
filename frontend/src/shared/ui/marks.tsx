import coinArt from "@/assets/currency/coin.webp";
import energyArt from "@/assets/currency/energy.webp";
import starArt from "@/assets/currency/star.webp";
import streakArt from "@/assets/currency/streak.webp";
import streakBlaze from "@/assets/streak/blaze.webp";
import streakEverburn from "@/assets/streak/everburn.webp";
import streakFlame from "@/assets/streak/flame.webp";
import streakSpark from "@/assets/streak/spark.webp";
import streakSteady from "@/assets/streak/steady.webp";
import banArt from "@/assets/marks/ban.webp";
import mailArt from "@/assets/marks/mail.webp";
import medalGold from "@/assets/marks/medal1.webp";
import medalSilver from "@/assets/marks/medal2.webp";
import medalBronze from "@/assets/marks/medal3.webp";
import bubbleArt from "@/assets/marks/bubbles.webp";
import clockArt from "@/assets/marks/clock.webp";
import giftArt from "@/assets/marks/gift.webp";
import linkArt from "@/assets/marks/link.webp";
import paletteArt from "@/assets/marks/palette.webp";
import slidersArt from "@/assets/marks/sliders.webp";
import crownArt from "@/assets/marks/crown.webp";
import eyeArt from "@/assets/marks/eye.webp";
import flagArt from "@/assets/marks/flag.webp";
import globeArt from "@/assets/marks/globe.webp";
import maskArt from "@/assets/marks/mask.webp";
import shieldArt from "@/assets/marks/shield.webp";
import sparkArt from "@/assets/marks/spark.webp";
import trophyArt from "@/assets/marks/trophy.webp";
import handArt from "@/assets/marks/hand.webp";
import heartArt from "@/assets/marks/heart.webp";
import infinityArt from "@/assets/marks/infinity.webp";
import keyArt from "@/assets/marks/key.webp";
import lockArt from "@/assets/marks/lock.webp";
import mutedArt from "@/assets/marks/mutemic.webp";
import ringArt from "@/assets/marks/ring.webp";
import gavelArt from "@/assets/owner/gavel.webp";
import promoArt from "@/assets/owner/promo.webp";

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

/** The Telegram star, drawn rather than traced from a glyph. */
export const StarMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={starArt} size={size} className={className} />
);

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

/**
 * The rest of the painted set. These stand where an outline glyph used to,
 * anywhere the icon names a thing rather than an action: a warning, a mute, a
 * locked piece, a gift code. Controls you tap are still drawn in ink.
 */
export const FlagMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={flagArt} size={size} className={className} />
);

export const MutedMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={mutedArt} size={size} className={className} />
);

export const LockMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={lockArt} size={size} className={className} />
);

export const KeyMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={keyArt} size={size} className={className} />
);

export const HeartMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={heartArt} size={size} className={className} />
);

export const HandMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={handArt} size={size} className={className} />
);

export const SupportMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={ringArt} size={size} className={className} />
);

export const InfinityMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={infinityArt} size={size} className={className} />
);

export const GavelMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={gavelArt} size={size} className={className} />
);

export const PromoMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={promoArt} size={size} className={className} />
);

export const CrownMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={crownArt} size={size} className={className} />
);

export const MaskMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={maskArt} size={size} className={className} />
);

export const ShieldMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={shieldArt} size={size} className={className} />
);

export const SparkMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={sparkArt} size={size} className={className} />
);

export const BubbleMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={bubbleArt} size={size} className={className} />
);

export const GlobeMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={globeArt} size={size} className={className} />
);

export const EyeMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={eyeArt} size={size} className={className} />
);

export const TrophyMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={trophyArt} size={size} className={className} />
);

export const GiftMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={giftArt} size={size} className={className} />
);

export const PaletteMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={paletteArt} size={size} className={className} />
);

export const SlidersMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={slidersArt} size={size} className={className} />
);

export const LinkMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={linkArt} size={size} className={className} />
);

export const BanMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={banArt} size={size} className={className} />
);

export const ClockMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={clockArt} size={size} className={className} />
);

export const MailMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <Mark src={mailArt} size={size} className={className} />
);

/** First, second and third, in that order. */
export const MEDALS = [medalGold, medalSilver, medalBronze];

export const MedalMark = ({
  place,
  size = 22,
  className,
}: {
  place: number;
  size?: number;
  className?: string;
}) => <Mark src={MEDALS[place] ?? medalBronze} size={size} className={className} />;
