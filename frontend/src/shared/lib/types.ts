export interface Stats {
  xp: number;
  level: number;
  coins: number;
  rating: number;
  dialogsTotal: number;
  voiceSeconds: number;
  messagesSent: number;
  gamesPlayed: number;
  gamesWon: number;
  friendsCount: number;
  likesReceived: number;
  streakDays: number;
  bestStreak: number;
}

export interface Progress {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  ratio: number;
  title: string;
}

export interface Preferences {
  noiseSuppression: "off" | "light" | "medium" | "high";
  theme: "auto" | "dark" | "light";
  haptics: boolean;
  sounds: boolean;
  autoReveal: boolean;
  matchLanguage: string;
  matchGender: string;
  allowFriendCalls: boolean;
  voicePreset: string;
}

export interface Profile {
  id: number;
  anonName: string;
  avatarSeed: string;
  bio: string | null;
  gender: string;
  ageRange: string | null;
  interests: string[];
  language: string;
  isPremium: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  referralCode: string;
  palette: string;
  uiLanguage: string;
  premium: { active: boolean; until: string | null };
  stats: Stats;
  progress: Progress;
  preferences: Preferences;
}

export interface PublicProfile {
  id: number;
  anonName: string;
  avatarSeed: string;
  bio: string | null;
  level: number;
  title: string;
  interests: string[];
  isOnline: boolean;
  isFriend: boolean;
}

export interface Friend {
  id: number;
  anonName: string;
  avatarSeed: string;
  alias: string | null;
  level: number;
  title: string;
  favourite: boolean;
  isOnline: boolean;
  activity: string | null;
  lastSeenAt: string | null;
}

export interface FriendRequest {
  id: number;
  userId: number;
  anonName: string;
  avatarSeed: string;
  level: number;
  direction: "incoming" | "outgoing" | "accepted";
  message: string | null;
  createdAt: string;
}

export interface RoomMember {
  userId: number;
  anonName: string;
  avatarSeed: string;
  level: number;
  role: string;
  muted: boolean;
  hand?: boolean;
  speaking?: boolean;
}

export interface Room {
  id: number;
  code: string;
  title: string;
  topic: string | null;
  emoji: string;
  kind: "voice" | "text" | "game";
  visibility: "public" | "private";
  language: string;
  gameKey: string | null;
  ownerId: number;
  maxParticipants: number;
  participants: number;
  members: RoomMember[];
  createdAt: string;
}

export interface GameMeta {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  minPlayers: number;
  maxPlayers: number;
  voiceRequired: boolean;
  durationMinutes: number;
  tags: string[];
  rules: string[];
}

export interface Achievement {
  key: string;
  title: string;
  description: string;
  icon: string;
  threshold: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  anonName: string;
  avatarSeed: string;
  level: number;
  value: number;
  isMe: boolean;
}

export interface Mask {
  name: string;
  seed: string;
  style: { palette: string; shape: number; pattern: number };
}

export interface ChatMessage {
  id: number | string;
  text: string;
  from: number;
  own: boolean;
  createdAt: string;
  pending?: boolean;
  system?: boolean;
}

export interface PresenceSnapshot {
  online: number;
  inVoice: number;
  searching: number;
}

export interface Reward {
  xp?: number;
  coins?: number;
  levelUp?: boolean;
  level?: number;
  achievements?: { key: string; title: string; icon: string }[];
}

export interface WheelPrize {
  key: string;
  kind: "energy" | "coins" | "premium";
  amount: number;
}

export interface StreakReward {
  day: number;
  energy: number;
  coins: number;
  premiumDays: number;
}

export interface EconomyState {
  energy: number;
  energyMax: number;
  unlimited: boolean;
  secondsToNext: number;
  costs: { text: number; voice: number };
  premium: { active: boolean; until: string | null };
  wheel: {
    spins: number;
    maxPending: number;
    voiceSecondsToday: number;
    requiredSeconds: number;
    prizes: WheelPrize[];
  };
  streak: {
    days: number;
    claimedToday: boolean;
    reward: StreakReward;
    ladder: StreakReward[];
  };
}

export interface SpinResult {
  key: string;
  kind: "energy" | "coins" | "premium";
  amount: number;
  granted: number;
  spinsLeft: number;
}

export interface Product {
  key: string;
  title: string;
  description: string;
  stars: number;
  days: number;
  energy: number;
  recurring: boolean;
}
