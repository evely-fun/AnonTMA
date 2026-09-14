"""Messages the app owes a person the next time they open it.

A warning that only changes a number in a database teaches nobody anything,
so every sanction and every gift writes one of these, and the app shows it
once. Delivery is best effort over the socket for whoever is online, and the
row is what guarantees it arrives either way.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Notice
from app.realtime.hub import hub

# What a notice can be about. The app has copy for each of these.
KINDS = (
    "warning",
    "muted",
    "banned",
    "unbanned",
    "gift",
    "promo",
)


async def push(
    session: AsyncSession, user_id: int, kind: str, payload: dict | None = None
) -> Notice:
    notice = Notice(user_id=user_id, kind=kind if kind in KINDS else "info", payload=payload or {})
    session.add(notice)
    await session.flush()
    # Whoever is holding the app open hears about it now rather than on a
    # reload, but the row above is what makes it certain.
    await hub.send_to_user(
        user_id,
        {"type": "notice", "payload": {"id": notice.id, "kind": notice.kind, **(payload or {})}},
    )
    return notice


async def unread(session: AsyncSession, user_id: int, limit: int = 10) -> list[dict]:
    rows = await session.execute(
        select(Notice)
        .where((Notice.user_id == user_id) & (Notice.seen.is_(False)))
        .order_by(Notice.id)
        .limit(limit)
    )
    return [
        {
            "id": notice.id,
            "kind": notice.kind,
            "payload": notice.payload,
            "at": notice.created_at.isoformat() if notice.created_at else None,
        }
        for notice in rows.scalars()
    ]


async def mark_seen(session: AsyncSession, user_id: int, ids: list[int]) -> int:
    if not ids:
        return 0
    rows = await session.execute(
        select(Notice).where((Notice.user_id == user_id) & (Notice.id.in_(ids[:50])))
    )
    count = 0
    for notice in rows.scalars():
        notice.seen = True
        count += 1
    return count
