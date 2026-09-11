from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.models import UserAchievement, UserStats


@dataclass(frozen=True, slots=True)
class Achievement:
    key: str
    title: str
    description: str
    icon: str
    metric: str
    threshold: int
    coins: int


CATALOG: tuple[Achievement, ...] = (
    Achievement("first_contact", "First Contact", "Finish your first conversation", "🌱", "dialogs_total", 1, 20),
    Achievement("talker_10", "Talker", "Finish 10 conversations", "💬", "dialogs_total", 10, 60),
    Achievement("talker_100", "Socialite", "Finish 100 conversations", "🎭", "dialogs_total", 100, 300),
    Achievement("voice_hour", "One Hour Voice", "Talk for 60 minutes total", "🎙", "voice_seconds", 3600, 80),
    Achievement("voice_ten_hours", "Voice Marathon", "Talk for 10 hours total", "🏔", "voice_seconds", 36000, 400),
    Achievement("writer_500", "Wordsmith", "Send 500 messages", "✍️", "messages_sent", 500, 120),
    Achievement("gamer_10", "Player", "Play 10 games", "🎮", "games_played", 10, 60),
    Achievement("champion_25", "Champion", "Win 25 games", "🏆", "games_won", 25, 250),
    Achievement("friendly_5", "Friendly", "Make 5 friends", "🤝", "friends_count", 5, 80),
    Achievement("popular_50", "Popular", "Receive 50 likes", "⭐️", "likes_received", 50, 200),
    Achievement("streak_7", "Weekly Habit", "Keep a 7 day streak", "🔥", "streak_days", 7, 150),
    Achievement("streak_30", "Unstoppable", "Keep a 30 day streak", "⚡️", "streak_days", 30, 600),
    Achievement("level_10", "Rising", "Reach level 10", "📈", "level", 10, 100),
    Achievement("level_30", "Veteran", "Reach level 30", "🛡", "level", 30, 400),
    Achievement("level_50", "Elite", "Reach level 50", "💎", "level", 50, 900),
)

BY_KEY = {item.key: item for item in CATALOG}


async def evaluate(session: AsyncSession, stats: UserStats) -> list[Achievement]:
    rows = await session.execute(
        select(UserAchievement).where(UserAchievement.user_id == stats.user_id)
    )
    existing = {row.key: row for row in rows.scalars()}
    unlocked: list[Achievement] = []

    for achievement in CATALOG:
        value = int(getattr(stats, achievement.metric, 0) or 0)
        record = existing.get(achievement.key)
        if record is None:
            record = UserAchievement(user_id=stats.user_id, key=achievement.key, progress=value)
            session.add(record)
        else:
            record.progress = value
        if value >= achievement.threshold and record.unlocked_at is None:
            record.unlocked_at = utcnow()
            stats.coins += achievement.coins
            unlocked.append(achievement)

    return unlocked
