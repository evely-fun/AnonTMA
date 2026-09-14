"""The owner's panel: handing things out, promo codes, and the ledger.

Anonymity is the constraint the whole file is written around. Staff never see
a Telegram id, a username or a real name anywhere in here; they work with the
anonymous name and the internal id, which are the same handles every other
player sees. A grant is written to a ledger so that reach this wide leaves a
trail, and the ledger is the only place the two ends of a hand out are linked.
"""

import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import as_utc, utcnow
from app.db.models import (
    Inventory,
    PromoCode,
    PromoRedemption,
    StaffGrant,
    User,
    UserStats,
)
from app.services import shop, staff
from app.services.economy import add_energy, grant_premium, is_premium

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8
MAX_CODE_ITEMS = 6
MAX_GRANT_COINS = 1_000_000


def make_code() -> str:
    """No letters that can be misread aloud, which matters when a code is read
    out on a stream rather than copied."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def _card(user: User, stats: UserStats | None) -> dict:
    """What staff are shown about a person. Deliberately no Telegram handle."""
    return {
        "userId": user.id,
        "anonName": user.anon_name,
        "avatarSeed": user.avatar_seed,
        "role": staff.role_of(user),
        "coins": stats.coins if stats else 0,
        "level": stats.level if stats else 1,
        "isBanned": user.is_banned,
        "mutedUntil": user.muted_until.isoformat() if user.muted_until else None,
        "warnings": user.warnings,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


async def find(session: AsyncSession, query: str, limit: int = 20) -> list[dict]:
    """Look someone up by their anonymous name or their internal id. There is
    deliberately no way to search by Telegram id or username."""
    query = query.strip()[:48]
    statement = select(User)
    if query.isdigit():
        statement = statement.where(User.id == int(query))
    elif query:
        statement = statement.where(User.anon_name.ilike(f"%{query}%"))
    else:
        statement = statement.order_by(User.id.desc())

    rows = await session.execute(statement.limit(limit))
    users = list(rows.scalars())
    return [_card(user, await session.get(UserStats, user.id)) for user in users]


async def grant(
    session: AsyncSession,
    actor: User,
    target_id: int,
    items: list[str],
    coins: int = 0,
    energy: int = 0,
    premium_days: int = 0,
    note: str | None = None,
) -> tuple[bool, str, dict]:
    if not staff.can(actor, "economy.grant"):
        return False, "not_allowed", {}

    target = await session.get(User, target_id)
    stats = await session.get(UserStats, target_id)
    if target is None or stats is None:
        return False, "no_such_user", {}

    given: dict = {"items": [], "coins": 0, "energy": 0, "premiumDays": 0}
    owned = await shop.owned_keys(session, target_id)
    for key in items[:MAX_CODE_ITEMS]:
        if key not in shop.BY_KEY or key in owned:
            continue
        session.add(Inventory(user_id=target_id, item=key, acquired_at=utcnow()))
        given["items"].append(key)

    coins = max(0, min(MAX_GRANT_COINS, int(coins)))
    if coins:
        stats.coins += coins
        given["coins"] = coins
    if energy:
        given["energy"] = add_energy(stats, is_premium(target), max(0, int(energy)))
    if premium_days:
        days = max(0, min(365, int(premium_days)))
        grant_premium(target, days)
        given["premiumDays"] = days

    session.add(
        StaffGrant(
            actor_id=actor.id,
            target_id=target_id,
            kind="grant",
            payload=given,
            note=(note or "")[:200] or None,
        )
    )
    # The person is told what arrived, but never who sent it.
    from app.services import notices

    await notices.push(session, target_id, "gift", given)
    return True, "ok", given


async def create_code(
    session: AsyncSession,
    actor: User,
    items: list[str],
    coins: int = 0,
    premium_days: int = 0,
    max_uses: int = 1,
    days_valid: int = 30,
    note: str | None = None,
) -> tuple[PromoCode | None, str]:
    if not staff.can(actor, "economy.grant"):
        return None, "not_allowed"

    clean = [key for key in items[:MAX_CODE_ITEMS] if key in shop.BY_KEY]
    if not clean and coins <= 0 and premium_days <= 0:
        return None, "empty"

    code = PromoCode(
        code=make_code(),
        items=clean,
        coins=max(0, min(MAX_GRANT_COINS, int(coins))),
        premium_days=max(0, min(365, int(premium_days))),
        max_uses=max(1, min(10_000, int(max_uses))),
        expires_at=utcnow() + timedelta(days=max(1, min(365, int(days_valid)))),
        created_by_id=actor.id,
        note=(note or "")[:120] or None,
    )
    session.add(code)
    await session.flush()
    return code, "ok"


async def redeem(session: AsyncSession, user: User, code: str) -> tuple[bool, str, dict]:
    rows = await session.execute(
        select(PromoCode).where(PromoCode.code == code.strip().upper()[:24])
    )
    entry = rows.scalar_one_or_none()
    if entry is None or not entry.active:
        return False, "unknown_code", {}
    expires = as_utc(entry.expires_at)
    if expires and expires < utcnow():
        return False, "expired", {}
    if entry.used >= entry.max_uses:
        return False, "used_up", {}

    already = await session.execute(
        select(func.count(PromoRedemption.id)).where(
            (PromoRedemption.code_id == entry.id) & (PromoRedemption.user_id == user.id)
        )
    )
    if int(already.scalar() or 0):
        return False, "already_redeemed", {}

    stats = await session.get(UserStats, user.id)
    given: dict = {"items": [], "coins": 0, "premiumDays": 0}
    owned = await shop.owned_keys(session, user.id)
    for key in entry.items:
        if key in shop.BY_KEY and key not in owned:
            session.add(Inventory(user_id=user.id, item=key, acquired_at=utcnow()))
            given["items"].append(key)
    if entry.coins and stats:
        stats.coins += entry.coins
        given["coins"] = entry.coins
    if entry.premium_days:
        grant_premium(user, entry.premium_days)
        given["premiumDays"] = entry.premium_days

    entry.used += 1
    session.add(PromoRedemption(code_id=entry.id, user_id=user.id))
    from app.services import notices

    await notices.push(session, user.id, "promo", given)
    return True, "ok", given


async def codes(session: AsyncSession, limit: int = 40) -> list[dict]:
    rows = await session.execute(
        select(PromoCode).order_by(PromoCode.id.desc()).limit(limit)
    )
    return [
        {
            "id": entry.id,
            "code": entry.code,
            "items": entry.items,
            "coins": entry.coins,
            "premiumDays": entry.premium_days,
            "used": entry.used,
            "maxUses": entry.max_uses,
            "active": entry.active,
            "note": entry.note,
            "expiresAt": entry.expires_at.isoformat() if entry.expires_at else None,
        }
        for entry in rows.scalars()
    ]


async def revoke_code(session: AsyncSession, actor: User, code_id: int) -> bool:
    if not staff.can(actor, "economy.grant"):
        return False
    entry = await session.get(PromoCode, code_id)
    if entry is None:
        return False
    entry.active = False
    return True


async def ledger(session: AsyncSession, limit: int = 50) -> list[dict]:
    rows = await session.execute(
        select(StaffGrant).order_by(StaffGrant.id.desc()).limit(limit)
    )
    entries = list(rows.scalars())
    names: dict[int, str] = {}
    for entry in entries:
        for user_id in (entry.actor_id, entry.target_id):
            if user_id not in names:
                person = await session.get(User, user_id)
                names[user_id] = person.anon_name if person else "—"
    return [
        {
            "id": entry.id,
            "actor": names.get(entry.actor_id, "—"),
            "target": names.get(entry.target_id, "—"),
            "targetId": entry.target_id,
            "kind": entry.kind,
            "payload": entry.payload,
            "note": entry.note,
            "at": entry.created_at.isoformat() if entry.created_at else None,
        }
        for entry in entries
    ]


def catalogue() -> list[dict]:
    """Everything that can be handed out, exclusives included."""
    return [
        {
            "key": item.key,
            "category": item.category,
            "value": item.value,
            "rarity": item.rarity,
            "exclusive": item.exclusive,
        }
        for item in shop.CATALOG
        if item.category in ("avatar", "frame", "effect", "background", "palette")
    ]
