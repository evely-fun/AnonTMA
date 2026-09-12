from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import ApiModel


class AuthRequest(ApiModel):
    init_data: str = Field(alias="initData", max_length=8192)
    start_param: str | None = Field(default=None, alias="startParam", max_length=128)


class RefreshRequest(ApiModel):
    refresh_token: str = Field(alias="refreshToken", max_length=2048)


class TokenPair(ApiModel):
    access_token: str = Field(alias="accessToken")
    refresh_token: str = Field(alias="refreshToken")
    expires_in: int = Field(alias="expiresIn")


class ProgressView(ApiModel):
    level: int
    xp: int
    xp_into_level: int = Field(alias="xpIntoLevel")
    xp_for_next: int = Field(alias="xpForNext")
    ratio: float
    title: str


class StatsView(ApiModel):
    xp: int
    level: int
    coins: int
    rating: int
    dialogs_total: int = Field(alias="dialogsTotal")
    voice_seconds: int = Field(alias="voiceSeconds")
    messages_sent: int = Field(alias="messagesSent")
    games_played: int = Field(alias="gamesPlayed")
    games_won: int = Field(alias="gamesWon")
    friends_count: int = Field(alias="friendsCount")
    likes_received: int = Field(alias="likesReceived")
    streak_days: int = Field(alias="streakDays")
    best_streak: int = Field(alias="bestStreak")


class PremiumView(ApiModel):
    active: bool
    until: datetime | None = None


class ProfileView(ApiModel):
    id: int
    anon_name: str = Field(alias="anonName")
    avatar_seed: str = Field(alias="avatarSeed")
    bio: str | None = None
    gender: str
    age_range: str | None = Field(default=None, alias="ageRange")
    interests: list[str]
    language: str
    is_premium: bool = Field(alias="isPremium")
    created_at: datetime = Field(alias="createdAt")
    last_seen_at: datetime | None = Field(default=None, alias="lastSeenAt")
    referral_code: str = Field(alias="referralCode")
    palette: str = "auto"
    ui_language: str = Field(default="auto", alias="uiLanguage")
    premium: PremiumView
    stats: StatsView
    progress: ProgressView
    preferences: dict


class PublicProfileView(ApiModel):
    id: int
    anon_name: str = Field(alias="anonName")
    avatar_seed: str = Field(alias="avatarSeed")
    bio: str | None = None
    level: int
    title: str
    interests: list[str]
    is_online: bool = Field(default=False, alias="isOnline")
    is_friend: bool = Field(default=False, alias="isFriend")


class ProfileUpdate(ApiModel):
    bio: str | None = Field(default=None, max_length=200)
    gender: str | None = Field(default=None, max_length=16)
    age_range: str | None = Field(default=None, alias="ageRange", max_length=16)
    interests: list[str] | None = Field(default=None, max_length=12)
    preferences: dict | None = None
    palette: str | None = Field(default=None, max_length=16)
    ui_language: str | None = Field(default=None, alias="uiLanguage", max_length=8)
    regenerate_mask: bool = Field(default=False, alias="regenerateMask")

    @field_validator("interests")
    @classmethod
    def clamp_interests(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return [item.strip()[:24] for item in value if item.strip()][:12]


class AchievementView(ApiModel):
    key: str
    title: str
    description: str
    icon: str
    threshold: int
    progress: int
    unlocked: bool
    unlocked_at: datetime | None = Field(default=None, alias="unlockedAt")


class LeaderboardEntry(ApiModel):
    rank: int
    user_id: int = Field(alias="userId")
    anon_name: str = Field(alias="anonName")
    avatar_seed: str = Field(alias="avatarSeed")
    level: int
    value: int
    is_me: bool = Field(default=False, alias="isMe")


class ReportRequest(ApiModel):
    reason: str = Field(max_length=32)
    scope: str = Field(default="dialog", max_length=16)
    scope_id: int | None = Field(default=None, alias="scopeId")
    details: str | None = Field(default=None, max_length=500)
