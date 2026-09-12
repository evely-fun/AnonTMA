from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import utcnow
from app.db.models import (
    ModerationAction,
    ModerationCase,
    Report,
    User,
    UserStats,
)
from app.services.progression import describe

ACTIONS = {
    "dismiss": 0,
    "warn": 0,
    "mute_24h": 24,
    "ban_7d": 24 * 7,
    "ban_permanent": 0,
    "unban": 0,
}


def is_admin(user: User) -> bool:
    return str(user.tg_id) in set(settings.admin_tg_ids)


async def _target_card(session: AsyncSession, target_id: int) -> dict:
    user = await session.get(User, target_id)
    stats = await session.get(UserStats, target_id)
    if user is None:
        return {"userId": target_id, "missing": True}
    progress = describe(stats.xp if stats else 0)
    history = await session.execute(
        select(func.count(ModerationAction.id)).where(
            (ModerationAction.target_id == target_id)
            & (ModerationAction.action != "dismiss")
        )
    )
    return {
        "userId": user.id,
        "anonName": user.anon_name,
        "avatarSeed": user.avatar_seed,
        "level": progress.level,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
        "trustScore": user.trust_score,
        "warnings": user.warnings,
        "isBanned": user.is_banned,
        "bannedUntil": user.banned_until.isoformat() if user.banned_until else None,
        "mutedUntil": user.muted_until.isoformat() if user.muted_until else None,
        "reportsReceived": stats.reports_received if stats else 0,
        "priorSanctions": int(history.scalar() or 0),
        "dialogsTotal": stats.dialogs_total if stats else 0,
    }


async def queue(session: AsyncSession, state: str, limit: int) -> list[dict]:
    rows = await session.execute(
        select(ModerationCase)
        .where(ModerationCase.state == state)
        .order_by(ModerationCase.priority.desc(), ModerationCase.last_report_at.desc())
        .limit(limit)
    )
    cases = rows.scalars().all()
    output = []
    for case in cases:
        output.append(
            {
                "id": case.id,
                "state": case.state,
                "priority": case.priority,
                "reportCount": case.report_count,
                "reporterCount": case.reporter_count,
                "reasons": case.reasons or {},
                "lastReportAt": case.last_report_at.isoformat() if case.last_report_at else None,
                "resolution": case.resolution,
                "target": await _target_card(session, case.target_id),
            }
        )
    return output


async def case_detail(session: AsyncSession, case_id: int) -> dict | None:
    case = await session.get(ModerationCase, case_id)
    if case is None:
        return None
    rows = await session.execute(
        select(Report).where(Report.case_id == case.id).order_by(Report.id.desc()).limit(20)
    )
    reports = [
        {
            "id": report.id,
            "reason": report.reason,
            "details": report.details,
            "scope": report.scope,
            "weight": report.weight,
            "createdAt": report.created_at.isoformat() if report.created_at else None,
            "evidence": report.evidence or {},
        }
        for report in rows.scalars().all()
    ]
    actions = await session.execute(
        select(ModerationAction)
        .where(ModerationAction.target_id == case.target_id)
        .order_by(ModerationAction.id.desc())
        .limit(10)
    )
    return {
        "id": case.id,
        "state": case.state,
        "priority": case.priority,
        "reportCount": case.report_count,
        "reporterCount": case.reporter_count,
        "reasons": case.reasons or {},
        "note": case.note,
        "target": await _target_card(session, case.target_id),
        "reports": reports,
        "history": [
            {
                "action": item.action,
                "durationHours": item.duration_hours,
                "note": item.note,
                "createdAt": item.created_at.isoformat() if item.created_at else None,
            }
            for item in actions.scalars().all()
        ],
    }


async def resolve(
    session: AsyncSession, admin: User, case_id: int, action: str, note: str | None
) -> dict | None:
    if action not in ACTIONS:
        return None
    case = await session.get(ModerationCase, case_id)
    if case is None:
        return None
    target = await session.get(User, case.target_id)
    if target is None:
        return None

    hours = ACTIONS[action]
    upheld = action not in ("dismiss", "unban")

    if action == "warn":
        target.warnings += 1
    elif action == "mute_24h":
        target.muted_until = utcnow() + timedelta(hours=hours)
    elif action == "ban_7d":
        target.is_banned = True
        target.banned_until = utcnow() + timedelta(hours=hours)
    elif action == "ban_permanent":
        target.is_banned = True
        target.banned_until = None
    elif action == "unban":
        target.is_banned = False
        target.banned_until = None
        target.muted_until = None
        target.trust_score = max(target.trust_score, 70)
    elif action == "dismiss":
        target.trust_score = min(100, target.trust_score + 8)

    reporters = await session.execute(
        select(Report.reporter_id).where(Report.case_id == case.id).distinct()
    )
    for (reporter_id,) in reporters.all():
        stats = await session.get(UserStats, reporter_id)
        if stats is not None and upheld:
            stats.reports_upheld += 1

    await session.execute(
        Report.__table__.update()
        .where(Report.case_id == case.id)
        .values(status="resolved")
    )

    case.state = "resolved"
    case.resolution = action
    case.resolved_at = utcnow()
    case.resolved_by_id = admin.id
    case.note = note

    session.add(
        ModerationAction(
            case_id=case.id,
            target_id=case.target_id,
            admin_id=admin.id,
            action=action,
            duration_hours=hours,
            note=note,
            created_at=utcnow(),
        )
    )
    await session.flush()
    return {"caseId": case.id, "action": action, "target": await _target_card(session, case.target_id)}


async def overview(session: AsyncSession) -> dict:
    open_cases = await session.execute(
        select(func.count(ModerationCase.id)).where(ModerationCase.state == "open")
    )
    day = utcnow() - timedelta(hours=24)
    fresh = await session.execute(
        select(func.count(Report.id)).where(Report.created_at >= day)
    )
    banned = await session.execute(
        select(func.count(User.id)).where(User.is_banned.is_(True))
    )
    resolved = await session.execute(
        select(func.count(ModerationCase.id)).where(
            (ModerationCase.state == "resolved") & (ModerationCase.resolved_at >= day)
        )
    )
    return {
        "openCases": int(open_cases.scalar() or 0),
        "reportsToday": int(fresh.scalar() or 0),
        "bannedUsers": int(banned.scalar() or 0),
        "resolvedToday": int(resolved.scalar() or 0),
    }
