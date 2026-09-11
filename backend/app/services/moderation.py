import re
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.models import Block, Report, User, UserStats

URL_PATTERN = re.compile(r"(https?://|t\.me/|@[A-Za-z0-9_]{5,})", re.IGNORECASE)
REPEAT_PATTERN = re.compile(r"(.)\1{9,}")
INVISIBLE_PATTERN = re.compile("[‪-‮⁦-⁩​-‏]")
REPORT_REASONS = ("spam", "abuse", "adult", "scam", "underage", "other")


def sanitize_text(value: str, limit: int = 1000) -> str:
    cleaned = value.replace("\x00", "").strip()
    cleaned = INVISIBLE_PATTERN.sub("", cleaned)
    return cleaned[:limit]


def looks_like_spam(value: str) -> bool:
    if URL_PATTERN.search(value):
        return True
    if REPEAT_PATTERN.search(value):
        return True
    letters = [char for char in value if char.isalpha()]
    if len(letters) > 20 and sum(1 for char in letters if char.isupper()) / len(letters) > 0.8:
        return True
    return False


async def is_blocked(session: AsyncSession, first_id: int, second_id: int) -> bool:
    result = await session.execute(
        select(Block.id).where(
            ((Block.blocker_id == first_id) & (Block.blocked_id == second_id))
            | ((Block.blocker_id == second_id) & (Block.blocked_id == first_id))
        )
    )
    return result.first() is not None


async def blocked_ids(session: AsyncSession, user_id: int) -> set[int]:
    result = await session.execute(
        select(Block.blocker_id, Block.blocked_id).where(
            (Block.blocker_id == user_id) | (Block.blocked_id == user_id)
        )
    )
    ids: set[int] = set()
    for blocker_id, blocked_id in result.all():
        ids.add(blocked_id if blocker_id == user_id else blocker_id)
    return ids


async def submit_report(
    session: AsyncSession,
    reporter_id: int,
    target_id: int,
    reason: str,
    scope: str,
    scope_id: int | None,
    details: str | None,
) -> Report:
    normalized = reason if reason in REPORT_REASONS else "other"
    report = Report(
        reporter_id=reporter_id,
        target_id=target_id,
        reason=normalized,
        scope=scope,
        scope_id=scope_id,
        details=sanitize_text(details or "", 500) or None,
    )
    session.add(report)

    stats = await session.get(UserStats, target_id)
    if stats:
        stats.reports_received += 1
    target = await session.get(User, target_id)
    if target:
        target.trust_score = max(0, target.trust_score - 12)
        if target.trust_score <= 40:
            target.is_banned = True
            target.banned_until = utcnow() + timedelta(hours=24)
    return report
