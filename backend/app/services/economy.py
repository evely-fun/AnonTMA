import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import as_utc, utcnow
from app.db.models import RewardLog, User, UserStats
from app.services.progression import energy_bonus

ENERGY_MAX = 120
ENERGY_REGEN_PER_HOUR = 12
ENERGY_COST = {"text": 4, "voice": 8}
ENERGY_GAME_REWARD = 6
ENERGY_GAME_WIN_BONUS = 6
ENERGY_DAILY_LOGIN = 25
ENERGY_REFERRAL = 60

WHEEL_REQUIRED_VOICE_SECONDS = 20 * 60
WHEEL_MAX_PENDING = 3

# The streak does not end at a week. It is a formula rather than a table, so
# day 400 is a real number and not the same payout as day 7. Each day pays less
# than the old table did, and keeps climbing instead: the reward for keeping it
# is the curve, not one large cliff.
STREAK_BASE_ENERGY = 6
STREAK_BASE_COINS = 12
# Where the climb levels off. The streak itself never stops, only its slope.
STREAK_GROWTH_DAYS = 60
# Every seventh day pays half again, every thirtieth adds a day of premium.
STREAK_WEEK = 7
STREAK_MONTH = 30

# What the flame looks like at each stage, and the day it starts on.
STREAK_TIERS = (
    ("spark", 1),
    ("flame", 3),
    ("steady", 7),
    ("blaze", 14),
    ("everburn", 30),
)


def streak_tier(day: int) -> str:
    name = STREAK_TIERS[0][0]
    for tier, starts in STREAK_TIERS:
        if day >= starts:
            name = tier
    return name


@dataclass(frozen=True, slots=True)
class WheelPrize:
    key: str
    kind: str
    amount: int
    weight: int


WHEEL_PRIZES: tuple[WheelPrize, ...] = (
    WheelPrize("energy_20", "energy", 20, 26),
    WheelPrize("energy_45", "energy", 45, 18),
    WheelPrize("energy_80", "energy", 80, 8),
    WheelPrize("coins_50", "coins", 50, 22),
    WheelPrize("coins_150", "coins", 150, 12),
    WheelPrize("premium_1", "premium", 1, 9),
    WheelPrize("premium_3", "premium", 3, 4),
    WheelPrize("premium_7", "premium", 7, 1),
)


def today_key() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def is_premium(user: User) -> bool:
    until = as_utc(user.premium_until)
    return bool(until and until > utcnow())


def grant_premium(user: User, days: int) -> datetime:
    base = as_utc(user.premium_until) if is_premium(user) else utcnow()
    user.premium_until = base + timedelta(days=days)
    return user.premium_until


def energy_cap(stats: UserStats) -> int:
    return ENERGY_MAX + energy_bonus(stats.level)


def regenerate(stats: UserStats, premium: bool) -> None:
    now = utcnow()
    if stats.energy_at is None:
        stats.energy_at = now
        return
    if premium:
        stats.energy_at = now
        return
    if stats.energy >= energy_cap(stats):
        stats.energy_at = now
        return

    elapsed = (now - (as_utc(stats.energy_at) or now)).total_seconds()
    gained = int(elapsed / 3600 * ENERGY_REGEN_PER_HOUR)
    if gained <= 0:
        return
    stats.energy = min(energy_cap(stats), stats.energy + gained)
    stats.energy_at = now


def seconds_to_next_energy(stats: UserStats, premium: bool) -> int:
    if premium or stats.energy >= energy_cap(stats):
        return 0
    step = 3600 / ENERGY_REGEN_PER_HOUR
    elapsed = (utcnow() - (as_utc(stats.energy_at) or utcnow())).total_seconds()
    return max(0, int(step - (elapsed % step)))


def spend(stats: UserStats, premium: bool, amount: int) -> bool:
    if premium:
        return True
    if stats.energy < amount:
        return False
    stats.energy -= amount
    stats.energy_at = stats.energy_at or utcnow()
    return True


def add_energy(stats: UserStats, premium: bool, amount: int) -> int:
    if premium:
        return 0
    before = stats.energy
    stats.energy = min(energy_cap(stats), stats.energy + amount)
    if stats.energy_at is None:
        stats.energy_at = utcnow()
    return stats.energy - before


def roll_wheel() -> WheelPrize:
    total = sum(prize.weight for prize in WHEEL_PRIZES)
    pick = random.randint(1, total)
    running = 0
    for prize in WHEEL_PRIZES:
        running += prize.weight
        if pick <= running:
            return prize
    return WHEEL_PRIZES[0]


def refresh_daily(stats: UserStats) -> None:
    today = today_key()
    if stats.wheel_day == today:
        return
    earned = 1 if stats.voice_seconds_today >= WHEEL_REQUIRED_VOICE_SECONDS else 0
    stats.wheel_spins = min(WHEEL_MAX_PENDING, stats.wheel_spins + earned)
    stats.wheel_day = today
    stats.voice_seconds_today = 0


def register_voice_time(stats: UserStats, seconds: int) -> None:
    refresh_daily(stats)
    before = stats.voice_seconds_today
    stats.voice_seconds_today = min(24 * 3600, before + max(0, seconds))
    if (
        before < WHEEL_REQUIRED_VOICE_SECONDS
        and stats.voice_seconds_today >= WHEEL_REQUIRED_VOICE_SECONDS
        and stats.wheel_spins < WHEEL_MAX_PENDING
    ):
        stats.wheel_spins += 1


def streak_reward_for(day: int) -> dict:
    day = max(1, day)
    steps = min(day, STREAK_GROWTH_DAYS)
    energy = STREAK_BASE_ENERGY + steps // 2
    coins = STREAK_BASE_COINS + steps * 3
    if day % STREAK_WEEK == 0:
        coins += coins // 2
    return {
        "day": day,
        "energy": energy,
        "coins": coins,
        "premiumDays": 1 if day % STREAK_MONTH == 0 else 0,
        "tier": streak_tier(day),
    }


async def claim_streak(session: AsyncSession, user: User, stats: UserStats) -> dict | None:
    today = today_key()
    if stats.streak_claimed_day == today:
        return None
    reward = streak_reward_for(stats.streak_days or 1)
    stats.streak_claimed_day = today
    gained = add_energy(stats, is_premium(user), int(reward["energy"]))
    stats.coins += int(reward["coins"])
    if reward["premiumDays"]:
        grant_premium(user, int(reward["premiumDays"]))
    session.add(
        RewardLog(
            user_id=user.id,
            kind="streak",
            prize=f"day_{stats.streak_days}",
            amount=int(reward["coins"]),
            created_at=utcnow(),
        )
    )
    return {
        "day": stats.streak_days,
        "energy": gained,
        "coins": int(reward["coins"]),
        "premiumDays": int(reward["premiumDays"]),
        "tier": streak_tier(stats.streak_days or 1),
    }


async def spin_wheel(session: AsyncSession, user: User, stats: UserStats) -> dict | None:
    refresh_daily(stats)
    if stats.wheel_spins <= 0:
        return None

    stats.wheel_spins -= 1
    prize = roll_wheel()
    premium = is_premium(user)
    granted = 0

    if prize.kind == "energy":
        granted = add_energy(stats, premium, prize.amount)
        if premium:
            stats.coins += prize.amount
    elif prize.kind == "coins":
        stats.coins += prize.amount
        granted = prize.amount
    elif prize.kind == "premium":
        grant_premium(user, prize.amount)
        granted = prize.amount

    session.add(
        RewardLog(
            user_id=user.id,
            kind="wheel",
            prize=prize.key,
            amount=prize.amount,
            created_at=utcnow(),
        )
    )
    return {
        "key": prize.key,
        "kind": prize.kind,
        "amount": prize.amount,
        "granted": granted,
        "spinsLeft": stats.wheel_spins,
    }


def state_payload(user: User, stats: UserStats) -> dict:
    premium = is_premium(user)
    regenerate(stats, premium)
    refresh_daily(stats)
    return {
        "energy": energy_cap(stats) if premium else stats.energy,
        "energyMax": energy_cap(stats),
        "unlimited": premium,
        "secondsToNext": seconds_to_next_energy(stats, premium),
        "costs": ENERGY_COST,
        "premium": {
            "active": premium,
            "until": user.premium_until.isoformat() if user.premium_until else None,
        },
        "wheel": {
            "spins": stats.wheel_spins,
            "maxPending": WHEEL_MAX_PENDING,
            "voiceSecondsToday": stats.voice_seconds_today,
            "requiredSeconds": WHEEL_REQUIRED_VOICE_SECONDS,
            "prizes": [
                {"key": prize.key, "kind": prize.kind, "amount": prize.amount}
                for prize in WHEEL_PRIZES
            ],
        },
        "streak": {
            "days": stats.streak_days,
            "claimedToday": stats.streak_claimed_day == today_key(),
            "tier": streak_tier(stats.streak_days or 1),
            "nextReward": streak_reward_for((stats.streak_days or 1) + 1),
            "reward": streak_reward_for(stats.streak_days or 1),
            # A window on the curve rather than a fixed week: what you are on
            # now and the six days in front of you, wherever you are.
            "ladder": [
                streak_reward_for(day)
                for day in range(
                    max(1, (stats.streak_days or 1)),
                    max(1, (stats.streak_days or 1)) + 7,
                )
            ],
        },
    }
