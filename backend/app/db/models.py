from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, BigIntPk, IntPk, TimestampMixin


class Gender(StrEnum):
    unknown = "unknown"
    male = "male"
    female = "female"


class DialogMode(StrEnum):
    text = "text"
    voice = "voice"


class RoomKind(StrEnum):
    voice = "voice"
    text = "text"
    game = "game"


class RoomVisibility(StrEnum):
    public = "public"
    private = "private"


class RequestStatus(StrEnum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    cancelled = "cancelled"


class GameStatus(StrEnum):
    lobby = "lobby"
    running = "running"
    finished = "finished"
    aborted = "aborted"


class User(Base, BigIntPk, TimestampMixin):
    __tablename__ = "users"

    tg_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(64))
    first_name: Mapped[str] = mapped_column(String(64), default="")
    photo_url: Mapped[str | None] = mapped_column(String(512))
    language: Mapped[str] = mapped_column(String(8), default="en")
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)

    anon_name: Mapped[str] = mapped_column(String(48), default="")
    avatar_seed: Mapped[str] = mapped_column(String(32), default="")
    bio: Mapped[str | None] = mapped_column(String(200))
    gender: Mapped[str] = mapped_column(String(16), default=Gender.unknown)
    age_range: Mapped[str | None] = mapped_column(String(16))
    interests: Mapped[list] = mapped_column(JSON, default=list)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)

    referral_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    referred_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    premium_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    palette: Mapped[str] = mapped_column(String(16), default="auto")
    ui_language: Mapped[str] = mapped_column(String(8), default="auto")
    equipped: Mapped[dict] = mapped_column(JSON, default=dict)
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    warnings: Mapped[int] = mapped_column(Integer, default=0)

    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trust_score: Mapped[int] = mapped_column(Integer, default=100)

    stats: Mapped["UserStats"] = relationship(back_populates="user", uselist=False, lazy="selectin")


class UserStats(Base, TimestampMixin):
    __tablename__ = "user_stats"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    xp: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    coins: Mapped[int] = mapped_column(Integer, default=0)
    rating: Mapped[int] = mapped_column(Integer, default=1000)

    dialogs_total: Mapped[int] = mapped_column(Integer, default=0)
    voice_seconds: Mapped[int] = mapped_column(Integer, default=0)
    messages_sent: Mapped[int] = mapped_column(Integer, default=0)
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    games_won: Mapped[int] = mapped_column(Integer, default=0)
    friends_count: Mapped[int] = mapped_column(Integer, default=0)
    likes_received: Mapped[int] = mapped_column(Integer, default=0)
    reports_received: Mapped[int] = mapped_column(Integer, default=0)
    reports_filed: Mapped[int] = mapped_column(Integer, default=0)
    reports_upheld: Mapped[int] = mapped_column(Integer, default=0)

    energy: Mapped[int] = mapped_column(Integer, default=60)
    energy_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voice_seconds_today: Mapped[int] = mapped_column(Integer, default=0)
    wheel_spins: Mapped[int] = mapped_column(Integer, default=0)
    wheel_day: Mapped[str | None] = mapped_column(String(10))
    streak_claimed_day: Mapped[str | None] = mapped_column(String(10))

    streak_days: Mapped[int] = mapped_column(Integer, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active_day: Mapped[str | None] = mapped_column(String(10))

    user: Mapped[User] = relationship(back_populates="stats")


class Friendship(Base, IntPk, TimestampMixin):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uq_friend_pair"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    friend_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    alias: Mapped[str | None] = mapped_column(String(48))
    favourite: Mapped[bool] = mapped_column(Boolean, default=False)


class FriendRequest(Base, IntPk, TimestampMixin):
    __tablename__ = "friend_requests"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_friend_request"),)

    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=RequestStatus.pending)
    dialog_id: Mapped[int | None] = mapped_column(BigInteger)
    message: Mapped[str | None] = mapped_column(String(200))


class Block(Base, IntPk, TimestampMixin):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),)

    blocker_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class Dialog(Base, BigIntPk, TimestampMixin):
    __tablename__ = "dialogs"
    __table_args__ = (Index("ix_dialog_members", "a_user_id", "b_user_id"),)

    a_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    b_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mode: Mapped[str] = mapped_column(String(8), default=DialogMode.text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_by_id: Mapped[int | None] = mapped_column(BigInteger)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    a_liked: Mapped[bool] = mapped_column(Boolean, default=False)
    b_liked: Mapped[bool] = mapped_column(Boolean, default=False)
    revealed: Mapped[bool] = mapped_column(Boolean, default=False)


class Message(Base, BigIntPk):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_scope", "scope", "scope_id", "id"),)

    scope: Mapped[str] = mapped_column(String(8), default="dialog")
    scope_id: Mapped[int] = mapped_column(BigInteger, index=True)
    sender_id: Mapped[int] = mapped_column(BigInteger, index=True)
    kind: Mapped[str] = mapped_column(String(16), default="text")
    body: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Room(Base, BigIntPk, TimestampMixin):
    __tablename__ = "rooms"

    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(64))
    topic: Mapped[str | None] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8), default="🎧")
    kind: Mapped[str] = mapped_column(String(8), default=RoomKind.voice)
    visibility: Mapped[str] = mapped_column(String(8), default=RoomVisibility.public)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    max_participants: Mapped[int] = mapped_column(Integer, default=8)
    language: Mapped[str] = mapped_column(String(8), default="en")
    game_key: Mapped[str | None] = mapped_column(String(32))
    password_hash: Mapped[str | None] = mapped_column(String(128))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RoomMember(Base, IntPk, TimestampMixin):
    __tablename__ = "room_members"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_member"),)

    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="member")
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    talk_seconds: Mapped[int] = mapped_column(Integer, default=0)


class GameSession(Base, BigIntPk, TimestampMixin):
    __tablename__ = "game_sessions"

    game_key: Mapped[str] = mapped_column(String(32), index=True)
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"))
    host_id: Mapped[int] = mapped_column(BigInteger, index=True)
    status: Mapped[str] = mapped_column(String(16), default=GameStatus.lobby, index=True)
    state: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GameResult(Base, BigIntPk):
    __tablename__ = "game_results"
    __table_args__ = (Index("ix_results_user_game", "user_id", "game_key"),)

    session_id: Mapped[int] = mapped_column(BigInteger, index=True)
    game_key: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    placement: Mapped[int] = mapped_column(Integer, default=0)
    won: Mapped[bool] = mapped_column(Boolean, default=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0)
    coins_awarded: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class UserAchievement(Base, IntPk):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_achievement"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(48))
    progress: Mapped[int] = mapped_column(Integer, default=0)
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Purchase(Base, BigIntPk, TimestampMixin):
    __tablename__ = "purchases"

    user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    product: Mapped[str] = mapped_column(String(32))
    mode: Mapped[str] = mapped_column(String(8), default="test")
    stars: Mapped[int] = mapped_column(Integer, default=0)
    days: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    payload: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    charge_id: Mapped[str | None] = mapped_column(String(128))


class RewardLog(Base, BigIntPk):
    __tablename__ = "reward_logs"
    __table_args__ = (Index("ix_reward_user_kind", "user_id", "kind"),)

    user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    kind: Mapped[str] = mapped_column(String(24))
    prize: Mapped[str] = mapped_column(String(32))
    amount: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Report(Base, BigIntPk, TimestampMixin):
    __tablename__ = "reports"

    reporter_id: Mapped[int] = mapped_column(BigInteger, index=True)
    target_id: Mapped[int] = mapped_column(BigInteger, index=True)
    scope: Mapped[str] = mapped_column(String(16), default="dialog")
    scope_id: Mapped[int | None] = mapped_column(BigInteger)
    reason: Mapped[str] = mapped_column(String(32))
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    case_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    weight: Mapped[int] = mapped_column(Integer, default=100)


class ModerationCase(Base, BigIntPk, TimestampMixin):
    __tablename__ = "moderation_cases"
    __table_args__ = (Index("ix_case_state", "state", "priority"),)

    target_id: Mapped[int] = mapped_column(BigInteger, index=True)
    state: Mapped[str] = mapped_column(String(16), default="open", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    report_count: Mapped[int] = mapped_column(Integer, default=0)
    reporter_count: Mapped[int] = mapped_column(Integer, default=0)
    reasons: Mapped[dict] = mapped_column(JSON, default=dict)
    last_report_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_id: Mapped[int | None] = mapped_column(BigInteger)
    resolution: Mapped[str | None] = mapped_column(String(24))
    note: Mapped[str | None] = mapped_column(Text)


class ModerationAction(Base, BigIntPk):
    __tablename__ = "moderation_actions"
    __table_args__ = (Index("ix_action_target", "target_id", "id"),)

    case_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    target_id: Mapped[int] = mapped_column(BigInteger, index=True)
    admin_id: Mapped[int] = mapped_column(BigInteger, index=True)
    action: Mapped[str] = mapped_column(String(24))
    duration_hours: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Inventory(Base, BigIntPk):
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("user_id", "item", name="uq_inventory_item"),)

    user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    item: Mapped[str] = mapped_column(String(48))
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
