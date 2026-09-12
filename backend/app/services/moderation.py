import re
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import as_utc, utcnow
from app.db.models import (
    Block,
    Dialog,
    Message,
    ModerationCase,
    Report,
    User,
    UserStats,
)

URL_PATTERN = re.compile(r"(https?://|t\.me/|@[A-Za-z0-9_]{5,})", re.IGNORECASE)
REPEAT_PATTERN = re.compile(r"(.)\1{9,}")
INVISIBLE_PATTERN = re.compile("[‪-‮⁦-⁩​-‏]")
REPORT_REASONS = ("spam", "abuse", "adult", "scam", "underage", "other")

SEVERITY = {
    "underage": 5,
    "adult": 4,
    "scam": 3,
    "abuse": 3,
    "spam": 2,
    "other": 1,
}

DUPLICATE_WINDOW_HOURS = 24
EVIDENCE_MESSAGES = 12
AUTO_SUSPEND_PRIORITY = 1200
AUTO_SUSPEND_REPORTERS = 4
TRUST_FLOOR = 0


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


async def reporter_weight(session: AsyncSession, reporter_id: int) -> int:
    """A reporter whose reports keep getting dismissed counts for less."""
    stats = await session.get(UserStats, reporter_id)
    if stats is None or stats.reports_filed < 4:
        return 100
    accuracy = stats.reports_upheld / stats.reports_filed
    if accuracy >= 0.5:
        return 120
    if accuracy >= 0.25:
        return 100
    if accuracy >= 0.1:
        return 60
    return 25


async def collect_evidence(
    session: AsyncSession, scope: str, scope_id: int | None, target_id: int
) -> dict:
    """Anonymous chats keep no audio, so evidence is the text trail plus context."""
    evidence: dict = {"scope": scope, "scopeId": scope_id}
    if scope_id is None:
        return evidence

    if scope in ("dialog", "room"):
        rows = await session.execute(
            select(Message)
            .where((Message.scope == scope) & (Message.scope_id == scope_id))
            .order_by(Message.id.desc())
            .limit(EVIDENCE_MESSAGES)
        )
        evidence["messages"] = [
            {
                "id": message.id,
                "from": message.sender_id,
                "byTarget": message.sender_id == target_id,
                "text": message.body[:400],
                "at": message.created_at.isoformat() if message.created_at else None,
            }
            for message in reversed(rows.scalars().all())
        ]

    if scope == "dialog":
        dialog = await session.get(Dialog, scope_id)
        if dialog is not None:
            evidence["dialog"] = {
                "mode": dialog.mode,
                "durationSeconds": dialog.duration_seconds,
                "revealed": dialog.revealed,
            }
            if dialog.mode == "voice":
                evidence["note"] = "voice_not_recorded"
    return evidence


async def _upsert_case(
    session: AsyncSession, target_id: int, reason: str, weight: int
) -> ModerationCase:
    rows = await session.execute(
        select(ModerationCase)
        .where((ModerationCase.target_id == target_id) & (ModerationCase.state == "open"))
        .limit(1)
    )
    case = rows.scalar_one_or_none()
    if case is None:
        case = ModerationCase(target_id=target_id, state="open", reasons={})
        session.add(case)
        await session.flush()

    reasons = dict(case.reasons or {})
    reasons[reason] = int(reasons.get(reason, 0)) + 1
    case.reasons = reasons
    case.report_count += 1
    case.last_report_at = utcnow()
    return case


async def _rescore(session: AsyncSession, case: ModerationCase, weight: int) -> None:
    distinct = await session.execute(
        select(func.count(func.distinct(Report.reporter_id))).where(Report.case_id == case.id)
    )
    case.reporter_count = max(1, int(distinct.scalar() or 0))
    severity = max(SEVERITY.get(key, 1) for key in (case.reasons or {"other": 1}))
    case.priority = int(case.reporter_count * severity * (weight / 100) * 100)


async def submit_report(
    session: AsyncSession,
    reporter_id: int,
    target_id: int,
    reason: str,
    scope: str,
    scope_id: int | None,
    details: str | None,
) -> Report | None:
    if reporter_id == target_id:
        return None

    normalized = reason if reason in REPORT_REASONS else "other"
    since = utcnow() - timedelta(hours=DUPLICATE_WINDOW_HOURS)
    duplicate = await session.execute(
        select(Report.id)
        .where(
            (Report.reporter_id == reporter_id)
            & (Report.target_id == target_id)
            & (Report.created_at >= since)
        )
        .limit(1)
    )
    if duplicate.first() is not None:
        return None

    weight = await reporter_weight(session, reporter_id)
    evidence = await collect_evidence(session, scope, scope_id, target_id)

    report = Report(
        reporter_id=reporter_id,
        target_id=target_id,
        reason=normalized,
        scope=scope,
        scope_id=scope_id,
        details=sanitize_text(details or "", 500) or None,
        evidence=evidence,
        weight=weight,
    )
    session.add(report)
    await session.flush()

    case = await _upsert_case(session, target_id, normalized, weight)
    report.case_id = case.id
    await session.flush()
    await _rescore(session, case, weight)

    reporter_stats = await session.get(UserStats, reporter_id)
    if reporter_stats is not None:
        reporter_stats.reports_filed += 1

    target_stats = await session.get(UserStats, target_id)
    if target_stats is not None:
        target_stats.reports_received += 1

    target = await session.get(User, target_id)
    if target is not None:
        target.trust_score = max(TRUST_FLOOR, target.trust_score - (weight * 8) // 100)
        if (
            case.priority >= AUTO_SUSPEND_PRIORITY
            and case.reporter_count >= AUTO_SUSPEND_REPORTERS
        ):
            target.muted_until = utcnow() + timedelta(hours=12)
    return report


def can_speak(user: User) -> bool:
    until = as_utc(user.muted_until)
    return not (until and until > utcnow())


def is_suspended(user: User) -> bool:
    if not user.is_banned:
        return False
    until = as_utc(user.banned_until)
    if until is None:
        return True
    if until > utcnow():
        return True
    user.is_banned = False
    user.banned_until = None
    return False
