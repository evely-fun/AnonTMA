from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.telegram_auth import TelegramUser
from app.db.base import utcnow
from app.db.models import Friendship, User, UserStats
from app.realtime.hub import hub
from app.services import economy, identity
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
    "voicePreset": "natural",
    # The hue the owner picked for their name effect, in degrees.
    "nameHue": 28,
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

    # Opening someone's invitation link is the whole consent step, so it makes
    # the two of you friends. This used to fire only for brand new accounts and
    # only paid the inviter, which is why sending a friend your link appeared to
    # do nothing: they arrived, nobody's list changed. It now works for anyone
    # following the link, while the referral bonus stays a one time thing for a
    # genuinely new account.
    if start_param and start_param.startswith("ref_"):
        inviter = await get_by_referral(session, start_param[4:])
        if inviter and inviter.id != user.id:
            if created:
                user.referred_by_id = inviter.id
                inviter_stats = await session.get(UserStats, inviter.id)
                if inviter_stats:
                    reward = economy.invite_reward(inviter_stats.invites_accepted)
                    inviter_stats.invites_accepted += 1
                    inviter_stats.coins += reward["coins"]
                    inviter_stats.xp += reward["xp"]
                    if reward["freeze"]:
                        inviter_stats.streak_freezes = min(
                            economy.MAX_FREEZES, inviter_stats.streak_freezes + reward["freeze"]
                        )
                    if reward["premiumDays"]:
                        economy.grant_premium(inviter, reward["premiumDays"])
                    # Whoever arrived starts with something too, so a link is
                    # worth following rather than only worth sending.
                    new_stats = await session.get(UserStats, user.id)
                    if new_stats:
                        new_stats.coins += economy.INVITE_WELCOME_COINS
            linked = await link_friends(session, inviter.id, user.id)
            if linked:
                # The inviter is usually sitting in the app when this happens,
                # so their list is told rather than left stale until a reload.
                await hub.send_to_user(
                    inviter.id, {"type": "friend.accepted", "payload": {"userId": user.id}}
                )

    await touch_presence(session, user)
    return user


async def link_friends(session: AsyncSession, left_id: int, right_id: int) -> bool:
    """Make two users friends both ways. Returns whether anything was added."""
    added = False
    for owner_id, other_id in ((left_id, right_id), (right_id, left_id)):
        existing = await session.execute(
            select(Friendship.id).where(
                (Friendship.user_id == owner_id) & (Friendship.friend_id == other_id)
            )
        )
        if existing.first() is not None:
            continue
        session.add(Friendship(user_id=owner_id, friend_id=other_id))
        stats = await session.get(UserStats, owner_id)
        if stats:
            stats.friends_count += 1
        added = True
    await session.flush()
    return added


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
            if gap == 1:
                stats.streak_days += 1
            elif gap > 1 and stats.streak_freezes > 0 and gap - 1 <= stats.streak_freezes:
                # One freeze covers one missed day. Spending them keeps the run
                # alive rather than restarting it, which is the whole point of
                # holding them.
                stats.streak_freezes -= gap - 1
                stats.streak_days += 1
            else:
                stats.streak_days = 1
        else:
            stats.streak_days = 1
        stats.best_streak = max(stats.best_streak, stats.streak_days)
        stats.last_active_day = today
        stats.coins += 10 + min(stats.streak_days, 10) * 2
        economy.add_energy(stats, economy.is_premium(user), economy.ENERGY_DAILY_LOGIN)
        await evaluate(session, stats)

    economy.regenerate(stats, economy.is_premium(user))
    economy.refresh_daily(stats)


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
