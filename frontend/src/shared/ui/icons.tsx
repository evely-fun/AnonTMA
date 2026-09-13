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
  LifeBuoy,
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
export const GiftIcon = (p: IconProps) => <Gift {...p} />;
export const WheelIcon = (p: IconProps) => <LifeBuoy {...p} />;
export const InfinityIcon = (p: IconProps) => <InfinityGlyph {...p} />;
