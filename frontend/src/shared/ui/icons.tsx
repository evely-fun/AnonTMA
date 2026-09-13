import {
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleUser,
  Clock,
  Crown,
  DoorOpen,
  Eye,
  Flag,
  Flame,
  Gamepad2,
  Ghost,
  Gift,
  Globe,
  Hand,
  Heart,
  Infinity as InfinityGlyph,
  LayoutGrid,
  Link2,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  Palette,
  Phone,
  PhoneOff,
  Plus,
  Radar,
  Radio,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
  Users,
  VenetianMask,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";

/**
 * The app addresses icons by role, not by glyph name, so the whole set can be
 * retuned in one place. Lucide draws on a 24 grid with a 2 unit stroke, which
 * scales down optically without a per size override.
 */
export type IconProps = Omit<LucideProps, "size"> & { size?: number };

export const RadarIcon = (p: IconProps) => <Radar {...p} />;
export const RoomsIcon = (p: IconProps) => <Radio {...p} />;
export const GamesIcon = (p: IconProps) => <Gamepad2 {...p} />;
export const FriendsIcon = (p: IconProps) => <Users {...p} />;
export const ProfileIcon = (p: IconProps) => <CircleUser {...p} />;

export const MicIcon = (p: IconProps) => <Mic {...p} />;
export const MicOffIcon = (p: IconProps) => <MicOff {...p} />;
export const PhoneIcon = (p: IconProps) => <Phone {...p} />;
export const PhoneEndIcon = (p: IconProps) => <PhoneOff {...p} />;
export const WaveIcon = (p: IconProps) => <AudioLines {...p} />;

export const SendIcon = (p: IconProps) => <SendHorizontal {...p} />;
export const ChatIcon = (p: IconProps) => <MessageCircle {...p} />;
export const SkipIcon = (p: IconProps) => <SkipForward {...p} />;
export const HeartIcon = (p: IconProps) => <Heart {...p} />;
export const MaskIcon = (p: IconProps) => <VenetianMask {...p} />;
export const GhostIcon = (p: IconProps) => <Ghost {...p} />;
export const EyeIcon = (p: IconProps) => <Eye {...p} />;

export const FlagIcon = (p: IconProps) => <Flag {...p} />;
export const ShieldIcon = (p: IconProps) => <ShieldCheck {...p} />;
export const LockIcon = (p: IconProps) => <Lock {...p} />;
export const HandIcon = (p: IconProps) => <Hand {...p} />;

export const CloseIcon = (p: IconProps) => <X {...p} />;
export const XMarkIcon = (p: IconProps) => <X {...p} />;
export const CheckIcon = (p: IconProps) => <Check {...p} />;
export const PlusIcon = (p: IconProps) => <Plus {...p} />;
export const ChevronIcon = (p: IconProps) => <ChevronRight {...p} />;
export const ArrowUpRightIcon = (p: IconProps) => <ArrowUpRight {...p} />;
export const SearchIcon = (p: IconProps) => <Search {...p} />;
export const GridIcon = (p: IconProps) => <LayoutGrid {...p} />;
export const DoorIcon = (p: IconProps) => <DoorOpen {...p} />;
export const LinkIcon = (p: IconProps) => <Link2 {...p} />;
export const ClockIcon = (p: IconProps) => <Clock {...p} />;
export const GlobeIcon = (p: IconProps) => <Globe {...p} />;

export const SettingsIcon = (p: IconProps) => <Settings {...p} />;
export const SlidersIcon = (p: IconProps) => <SlidersHorizontal {...p} />;
export const PaletteIcon = (p: IconProps) => <Palette {...p} />;

export const TrophyIcon = (p: IconProps) => <Trophy {...p} />;
export const FlameIcon = (p: IconProps) => <Flame {...p} />;
export const StarIcon = (p: IconProps) => <Star {...p} />;
export const SparkleIcon = (p: IconProps) => <Sparkles {...p} />;
export const CrownIcon = (p: IconProps) => <Crown {...p} />;
export const BoltIcon = (p: IconProps) => <Zap {...p} />;
/** Lucide's stacked coins turn to mush at the 13px used in the header chips. */
export const CoinIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 7.6v8.8M14.4 9.4a2.6 2.6 0 0 0-2.4-1.3c-1.4 0-2.5.9-2.5 2s1.1 1.8 2.5 1.8 2.5.7 2.5 1.8-1.1 2-2.5 2a2.6 2.6 0 0 1-2.4-1.3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
/**
 * The Telegram Star, drawn rather than borrowed from an icon set: a five
 * pointed star leaning forward, filled with Telegram's own gold. It marks the
 * Stars price and nothing else, because the shape means a payment in Telegram
 * and using it for anything else would be a lie about what the tap does.
 */
export const TelegramStarIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
    <defs>
      <linearGradient id="tgStar" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFD84D" />
        <stop offset="0.55" stopColor="#FFB02E" />
        <stop offset="1" stopColor="#F08A13" />
      </linearGradient>
    </defs>
    <path
      d="M13.98 2.53a1 1 0 0 1 .9 1.35l-1.7 4.6h5.2a1.35 1.35 0 0 1 .93 2.33l-9.1 8.62a1 1 0 0 1-1.6-1.1l1.7-4.6H5.1a1.35 1.35 0 0 1-.93-2.33l9.1-8.62a1 1 0 0 1 .71-.25Z"
      fill="url(#tgStar)"
    />
  </svg>
);
export const GiftIcon = (p: IconProps) => <Gift {...p} />;
export const InfinityIcon = (p: IconProps) => <InfinityGlyph {...p} />;
