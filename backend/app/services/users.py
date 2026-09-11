from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.telegram_auth import TelegramUser
from app.db.base import utcnow
from app.db.models import User, UserStats
from app.services import identity
from app.services.achievements import evaluate
from app.services.progression import describe

DEFAULT_PREFERENCES: dict = {
    "noiseSuppression": "medium",
    "theme": "auto",
    "haptics": True,
    "sounds": True,
    "autoReveal": False,
    "matchLanguage": "any",
    "matchGender": "any",
    "allowFriendCalls": True,
}


async def get_by_tg_id(session: AsyncSession, tg_id: int) -> User | None:
    result = await session.execute(select(User).where(User.tg_id == tg_id))
    return result.scalar_one_or_none()


async def get_by_referral(session: AsyncSession, code: str) -> User | None:
    result = await session.execute(select(User).where(User.referral_code == code))
    return result.scalar_one_or_none()


async def ensure_user(
    session: AsyncSession, profile: TelegramUser, start_param: str | None = None
) -> User:
    user = await get_by_tg_id(session, profile.id)
    created = user is None

    if user is None:
        seed = identity.new_seed()
        user = User(
            tg_id=profile.id,
            username=profile.username,
            first_name=profile.first_name,
            photo_url=profile.photo_url,
            language=profile.language_code or "en",
            is_premium=profile.is_premium,
            anon_name=identity.mask_name(seed, profile.language_code or "en"),
            avatar_seed=seed,
            interests=[],
            preferences=dict(DEFAULT_PREFERENCES),
            referral_code=identity.referral_code(),
        )
        session.add(user)
        await session.flush()
        session.add(UserStats(user_id=user.id))
        await session.flush()
    else:
        user.username = profile.username
        user.first_name = profile.first_name
        user.photo_url = profile.photo_url
        user.is_premium = profile.is_premium

    if created and start_param and start_param.startswith("ref_"):
        inviter = await get_by_referral(session, start_param[4:])
        if inviter and inviter.id != user.id:
            user.referred_by_id = inviter.id
            inviter_stats = await session.get(UserStats, inviter.id)
            if inviter_stats:
                inviter_stats.coins += 100
                inviter_stats.xp += 50

    await touch_presence(session, user)
    return user


async def touch_presence(session: AsyncSession, user: User) -> None:
    user.last_seen_at = utcnow()
    stats = await session.get(UserStats, user.id)
    if stats is None:
        stats = UserStats(user_id=user.id)
        session.add(stats)
        await session.flush()

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    if stats.last_active_day != today:
        previous = stats.last_active_day
        if previous:
            gap = (
                datetime.strptime(today, "%Y-%m-%d") - datetime.strptime(previous, "%Y-%m-%d")
            ).days
            stats.streak_days = stats.streak_days + 1 if gap == 1 else 1
        else:
            stats.streak_days = 1
        stats.best_streak = max(stats.best_streak, stats.streak_days)
        stats.last_active_day = today
        stats.coins += 10 + min(stats.streak_days, 10) * 2
        await evaluate(session, stats)


async def award(
    session: AsyncSession, user_id: int, xp: int = 0, coins: int = 0, rating_delta: int = 0
) -> dict:
    stats = await session.get(UserStats, user_id)
    if stats is None:
        return {}
    before = describe(stats.xp)
    stats.xp = max(0, stats.xp + xp)
    stats.coins = max(0, stats.coins + coins)
    stats.rating = max(0, stats.rating + rating_delta)
    after = describe(stats.xp)
    stats.level = after.level
    unlocked = await evaluate(session, stats)
    return {
        "xp": xp,
        "coins": coins,
        "levelUp": after.level > before.level,
        "level": after.level,
        "achievements": [
            {"key": item.key, "title": item.title, "icon": item.icon} for item in unlocked
        ],
    }
