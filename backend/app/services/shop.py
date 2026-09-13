from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.models import Inventory, RewardLog, User, UserStats
from app.services.economy import ENERGY_MAX, WHEEL_MAX_PENDING, add_energy, grant_premium, is_premium


@dataclass(frozen=True, slots=True)
class Item:
    key: str
    category: str
    price: int
    value: str
    rarity: str
    premiumOnly: bool = False


# Cosmetics are permanent unlocks, boosts are consumed on purchase.
CATALOG: tuple[Item, ...] = (
    # Everyone gets a real character for free, the abstract marks are the
    # ones that cost something now.
    Item("avatar.adventurer", "avatar", 0, "adventurer", "base"),
    Item("avatar.notionists", "avatar", 0, "notionists", "base"),
    Item("avatar.lorelei", "avatar", 0, "lorelei", "base"),
    Item("avatar.openPeeps", "avatar", 0, "openPeeps", "base"),
    Item("avatar.micah", "avatar", 0, "micah", "base"),
    Item("avatar.personas", "avatar", 700, "personas", "common"),
    Item("avatar.bigSmile", "avatar", 900, "bigSmile", "common"),
    Item("avatar.avataaars", "avatar", 1200, "avataaars", "common"),
    Item("avatar.pixelArt", "avatar", 1600, "pixelArt", "rare"),
    Item("avatar.bottts", "avatar", 1900, "bottts", "rare"),
    Item("avatar.thumbs", "avatar", 2200, "thumbs", "epic"),
    Item("avatar.shapes", "avatar", 2600, "shapes", "epic"),
    Item("avatar.geometric", "avatar", 2600, "geometric", "epic"),

    Item("frame.none", "frame", 0, "none", "base"),
    Item("frame.halo", "frame", 500, "halo", "common"),
    Item("frame.pulse", "frame", 1100, "pulse", "common"),
    Item("frame.orbit", "frame", 1900, "orbit", "rare"),
    Item("frame.ember", "frame", 2400, "ember", "rare"),
    Item("frame.gilded", "frame", 3000, "gilded", "epic"),

    Item("effect.none", "effect", 0, "none", "base"),
    Item("effect.gradient", "effect", 1200, "gradient", "common"),
    Item("effect.glow", "effect", 2200, "glow", "rare"),
    Item("effect.aurora", "effect", 3500, "aurora", "epic"),

    Item("background.none", "background", 0, "none", "base"),
    Item("background.dawn", "background", 600, "dawn", "common"),
    Item("background.tide", "background", 900, "tide", "common"),
    Item("background.mesh", "background", 1400, "mesh", "rare"),
    Item("background.nebula", "background", 2100, "nebula", "rare"),
    Item("background.prism", "background", 2800, "prism", "epic"),
    Item("background.aurora", "background", 3600, "aurora", "legendary"),

    Item("palette.garnet", "palette", 800, "garnet", "common"),
    Item("palette.amethyst", "palette", 1000, "amethyst", "common"),
    Item("palette.sepia", "palette", 1300, "sepia", "rare"),
    Item("palette.chrome", "palette", 1600, "chrome", "rare"),

    Item("boost.energy", "boost", 300, "energy", "common"),
    Item("boost.spin", "boost", 750, "spin", "rare"),

    Item("premium.week", "premium", 4000, "7", "epic"),
    Item("premium.month", "premium", 14000, "30", "legendary"),
)

BY_KEY = {item.key: item for item in CATALOG}
FREE_KEYS = {item.key for item in CATALOG if item.price == 0}
SLOTS = {"avatar": "avatar", "frame": "frame", "effect": "effect", "background": "background"}
DEFAULT_EQUIPPED = {
    "avatar": "adventurer",
    "frame": "none",
    "effect": "none",
    "background": "none",
}


def equipped_of(user: User) -> dict:
    merged = dict(DEFAULT_EQUIPPED)
    merged.update(user.equipped or {})
    return merged


async def owned_keys(session: AsyncSession, user_id: int) -> set[str]:
    rows = await session.execute(select(Inventory.item).where(Inventory.user_id == user_id))
    return set(FREE_KEYS) | {row[0] for row in rows.all()}


def catalog_payload(owned: set[str], coins: int) -> list[dict]:
    return [
        {
            "key": item.key,
            "category": item.category,
            "value": item.value,
            "price": item.price,
            "rarity": item.rarity,
            "owned": item.key in owned,
            "affordable": coins >= item.price,
            "consumable": item.category in ("boost", "premium"),
        }
        for item in CATALOG
    ]


async def buy(session: AsyncSession, user: User, key: str) -> dict:
    item = BY_KEY.get(key)
    if item is None:
        return {"error": "unknown_item"}

    stats = await session.get(UserStats, user.id)
    if stats is None:
        return {"error": "no_stats"}

    consumable = item.category in ("boost", "premium")
    owned = await owned_keys(session, user.id)
    if not consumable and key in owned:
        return {"error": "already_owned"}
    if stats.coins < item.price:
        return {"error": "not_enough_coins"}

    stats.coins -= item.price
    granted: dict = {}

    if item.category == "boost" and item.value == "energy":
        granted["energy"] = add_energy(stats, is_premium(user), ENERGY_MAX)
    elif item.category == "boost" and item.value == "spin":
        stats.wheel_spins = min(WHEEL_MAX_PENDING, stats.wheel_spins + 1)
        granted["spins"] = stats.wheel_spins
    elif item.category == "premium":
        days = int(item.value)
        grant_premium(user, days)
        granted["premiumDays"] = days
    else:
        session.add(Inventory(user_id=user.id, item=key, acquired_at=utcnow()))
        slot = SLOTS.get(item.category)
        if slot:
            equipped = equipped_of(user)
            equipped[slot] = item.value
            user.equipped = equipped
            granted["equipped"] = slot

    session.add(
        RewardLog(
            user_id=user.id,
            kind="shop",
            prize=key,
            amount=-item.price,
            created_at=utcnow(),
        )
    )
    await session.flush()
    return {"key": key, "coins": stats.coins, "granted": granted}


async def equip(session: AsyncSession, user: User, key: str) -> dict:
    item = BY_KEY.get(key)
    if item is None or item.category not in SLOTS:
        return {"error": "unknown_item"}
    owned = await owned_keys(session, user.id)
    if key not in owned:
        return {"error": "not_owned"}
    equipped = equipped_of(user)
    equipped[SLOTS[item.category]] = item.value
    user.equipped = equipped
    await session.flush()
    return {"equipped": equipped}
