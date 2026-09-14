from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.db.models import Block, Friendship, User, UserAchievement, UserStats
from app.realtime import presence
from app.schemas.user import (
    AchievementView,
    ActionRequest,
    LeaderboardEntry,
    ProfileUpdate,
    ProfileView,
    PublicProfileView,
    ReportRequest,
)
from app.services import identity, staff
from app.services.achievements import CATALOG
from app.services.moderation import submit_report
from app.services.economy import is_premium
from app.services.shop import equipped_of, owned_keys
from app.services.progression import coin_bonus, describe, energy_bonus, ladder, title_for_level
from app.services.users import DEFAULT_PREFERENCES

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(rate_limit_default)])

ALLOWED_PALETTES = (
    "auto",
    "obsidian",
    "indigo",
    "moss",
    "amethyst",
    "terracotta",
    "dusk",
    "cobalt",
    "garnet",
    "chrome",
    "sepia",
)

ALLOWED_PREFERENCES: dict[str, type | tuple[type, ...]] = {
    "noiseSuppression": str,
    "theme": str,
    "haptics": bool,
    "sounds": bool,
    "autoReveal": bool,
    "matchLanguage": str,
    "matchGender": str,
    "allowFriendCalls": bool,
    "voicePreset": str,
    "nameHue": int,
    # Announcing yourself on the way into a room. Only the owner may turn it
    # on, and the check lives in the merge below rather than in the client.
    "announceEntrance": bool,
}

LEADERBOARD_FIELDS = {
    "xp": UserStats.xp,
    "rating": UserStats.rating,
    "voice": UserStats.voice_seconds,
    "games": UserStats.games_won,
    "streak": UserStats.best_streak,
}


PAID_PALETTES = {"garnet", "amethyst", "sepia", "chrome"}


def serialize_profile(user: User, stats: UserStats) -> ProfileView:
    progress = describe(stats.xp)
    return ProfileView.model_validate(
        {
            "id": user.id,
            "anonName": user.anon_name,
            "avatarSeed": user.avatar_seed,
            "bio": user.bio,
            "gender": user.gender,
            "ageRange": user.age_range,
            "interests": user.interests or [],
            "language": user.language,
            "isPremium": user.is_premium,
            "createdAt": user.created_at,
            "lastSeenAt": user.last_seen_at,
            "referralCode": user.referral_code,
            "palette": user.palette or "auto",
            "equipped": equipped_of(user),
            "uiLanguage": user.ui_language or "auto",
            "role": staff.role_of(user),
            "rights": sorted(staff.rights_of(user)),
            "premium": {
                "active": is_premium(user),
                "until": user.premium_until,
            },
            "preferences": user.preferences or {},
            "stats": {
                "xp": stats.xp,
                "level": progress.level,
                "coins": stats.coins,
                "rating": stats.rating,
                "dialogsTotal": stats.dialogs_total,
                "voiceSeconds": stats.voice_seconds,
                "messagesSent": stats.messages_sent,
                "gamesPlayed": stats.games_played,
                "gamesWon": stats.games_won,
                "friendsCount": stats.friends_count,
                "likesReceived": stats.likes_received,
                "streakDays": stats.streak_days,
                "bestStreak": stats.best_streak,
            },
            "progress": {
                "level": progress.level,
                "xp": progress.xp,
                "xpIntoLevel": progress.xp_into_level,
                "xpForNext": progress.xp_for_next,
                "ratio": progress.ratio,
                "title": progress.title,
            },
        }
    )


async def load_stats(session: SessionDep, user_id: int) -> UserStats:
    stats = await session.get(UserStats, user_id)
    if stats is None:
        stats = UserStats(user_id=user_id)
        session.add(stats)
        await session.flush()
    return stats


@router.get("/me", response_model=ProfileView)
async def read_me(user: CurrentUser, session: SessionDep) -> ProfileView:
    return serialize_profile(user, await load_stats(session, user.id))


@router.patch("/me", response_model=ProfileView)
async def update_me(payload: ProfileUpdate, user: CurrentUser, session: SessionDep) -> ProfileView:
    if payload.bio is not None:
        user.bio = payload.bio.strip()[:200]
    if payload.gender is not None and payload.gender in ("unknown", "male", "female"):
        user.gender = payload.gender
    if payload.age_range is not None:
        user.age_range = payload.age_range
    if payload.interests is not None:
        user.interests = payload.interests
    if payload.preferences is not None:
        merged = dict(DEFAULT_PREFERENCES)
        merged.update(user.preferences or {})
        for key, value in payload.preferences.items():
            if key not in ALLOWED_PREFERENCES:
                continue
            if key == "announceEntrance":
                if not staff.can(user, "owner.announce"):
                    continue
            if isinstance(value, bool) and ALLOWED_PREFERENCES[key] is not bool:
                continue
            if not isinstance(value, ALLOWED_PREFERENCES[key]):
                continue
            merged[key] = value % 360 if key == "nameHue" else value
        user.preferences = merged
    if payload.palette is not None and payload.palette in ALLOWED_PALETTES:
        if payload.palette in PAID_PALETTES:
            owned = await owned_keys(session, user.id)
            if f"palette.{payload.palette}" not in owned:
                raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Palette is locked")
        user.palette = payload.palette
    if payload.ui_language is not None and payload.ui_language in ("auto", "en", "ru"):
        user.ui_language = payload.ui_language
    if payload.regenerate_mask:
        seed = identity.new_seed()
        user.avatar_seed = seed
        user.anon_name = identity.mask_name(seed, user.language)
    await session.flush()
    return serialize_profile(user, await load_stats(session, user.id))


@router.get("/me/levels")
async def levels(user: CurrentUser, session: SessionDep) -> dict:
    stats = await load_stats(session, user.id)
    progress = describe(stats.xp)
    return {
        "level": progress.level,
        "xp": progress.xp,
        "xpIntoLevel": progress.xp_into_level,
        "xpForNext": progress.xp_for_next,
        "ratio": progress.ratio,
        "title": progress.title,
        "energyBonus": energy_bonus(progress.level),
        "coinBonus": coin_bonus(progress.level),
        "ladder": ladder(progress.level),
    }


@router.get("/me/achievements", response_model=list[AchievementView])
async def my_achievements(user: CurrentUser, session: SessionDep) -> list[AchievementView]:
    rows = await session.execute(
        select(UserAchievement).where(UserAchievement.user_id == user.id)
    )
    progress = {row.key: row for row in rows.scalars()}
    stats = await load_stats(session, user.id)
    output: list[AchievementView] = []
    for item in CATALOG:
        record = progress.get(item.key)
        value = record.progress if record else int(getattr(stats, item.metric, 0) or 0)
        output.append(
            AchievementView.model_validate(
                {
                    "key": item.key,
                    "title": item.title,
                    "description": item.description,
                    "icon": item.icon,
                    "threshold": item.threshold,
                    "progress": min(value, item.threshold),
                    "unlocked": bool(record and record.unlocked_at),
                    "unlockedAt": record.unlocked_at if record else None,
                }
            )
        )
    return output


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    user: CurrentUser,
    session: SessionDep,
    metric: str = Query(default="xp"),
    limit: int = Query(default=50, ge=5, le=100),
) -> list[LeaderboardEntry]:
    column = LEADERBOARD_FIELDS.get(metric, UserStats.xp)
    rows = await session.execute(
        select(User, UserStats, column.label("value"))
        .join(UserStats, UserStats.user_id == User.id)
        .where(User.is_banned.is_(False))
        .order_by(desc(column))
        .limit(limit)
    )
    entries: list[LeaderboardEntry] = []
    for index, (row_user, row_stats, value) in enumerate(rows.all(), start=1):
        entries.append(
            LeaderboardEntry.model_validate(
                {
                    "rank": index,
                    "userId": row_user.id,
                    "anonName": row_user.anon_name,
                    "avatarSeed": row_user.avatar_seed,
                    "avatarStyle": equipped_of(row_user)["avatar"],
                    "frame": equipped_of(row_user)["frame"],
                    "level": row_stats.level,
                    "value": int(value or 0),
                    "isMe": row_user.id == user.id,
                }
            )
        )
    return entries


@router.get("/{user_id}", response_model=PublicProfileView)
async def public_profile(
    user_id: int, user: CurrentUser, session: SessionDep
) -> PublicProfileView:
    target = await session.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    stats = await load_stats(session, target.id)
    friend = await session.execute(
        select(Friendship.id).where(
            (Friendship.user_id == user.id) & (Friendship.friend_id == target.id)
        )
    )
    return PublicProfileView.model_validate(
        {
            "id": target.id,
            "anonName": target.anon_name,
            "avatarSeed": target.avatar_seed,
            "avatarStyle": equipped_of(target)["avatar"],
            "frame": equipped_of(target)["frame"],
            "bio": target.bio,
            "level": stats.level,
            "title": title_for_level(stats.level),
            "interests": target.interests or [],
            "isOnline": await presence.is_online(target.id),
            "isFriend": friend.first() is not None,
        }
    )


def _action_state(viewer: User, target: User, blocked: bool) -> dict:
    """What the viewer may do, and the little of the target's record they are
    allowed to see. A plain player learns nothing here beyond their own block."""
    state = {
        "userId": target.id,
        "actions": staff.actions_for(viewer, target),
        "blocked": blocked,
        "role": staff.role_of(target),
    }
    if staff.can(viewer, "moderation.act"):
        state["record"] = {
            "warnings": target.warnings,
            "isBanned": target.is_banned,
            "mutedUntil": target.muted_until.isoformat() if target.muted_until else None,
        }
    return state


@router.get("/{user_id}/actions")
async def actions(user_id: int, user: CurrentUser, session: SessionDep) -> dict:
    """What this viewer may do about that person, decided here rather than in
    the client, so the app renders exactly the buttons it is allowed."""
    from app.services import moderation

    target = await session.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")
    blocked = await moderation.is_blocked(session, user.id, user_id)
    return _action_state(user, target, blocked)


@router.post("/{user_id}/actions")
async def act(
    user_id: int, payload: ActionRequest, user: CurrentUser, session: SessionDep
) -> dict:
    """Carry out one of those actions. The list above is the authority: an
    action that is not in it for this pair is refused whatever the client sent."""
    from app.services import admin as moderation_admin
    from app.services import moderation

    target = await session.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")

    action = payload.action
    if action not in staff.actions_for(user, target) or action in ("report", "grant"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")

    if action == "block":
        await _block(session, user.id, user_id)
    else:
        await moderation_admin.sanction(session, user, target, action, payload.note)

    await session.flush()
    blocked = await moderation.is_blocked(session, user.id, user_id)
    return _action_state(user, target, blocked)


async def _block(session: AsyncSession, blocker_id: int, blocked_id: int) -> None:
    if blocker_id == blocked_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot block yourself")
    exists = await session.execute(
        select(Block.id).where((Block.blocker_id == blocker_id) & (Block.blocked_id == blocked_id))
    )
    if exists.first() is not None:
        return
    session.add(Block(blocker_id=blocker_id, blocked_id=blocked_id))
    await session.execute(
        delete(Friendship).where(
            ((Friendship.user_id == blocker_id) & (Friendship.friend_id == blocked_id))
            | ((Friendship.user_id == blocked_id) & (Friendship.friend_id == blocker_id))
        )
    )


@router.post("/{user_id}/block")
async def block_user(user_id: int, user: CurrentUser, session: SessionDep) -> dict:
    await _block(session, user.id, user_id)
    return {"ok": True}


@router.delete("/{user_id}/block")
async def unblock_user(user_id: int, user: CurrentUser, session: SessionDep) -> dict:
    await session.execute(
        delete(Block).where((Block.blocker_id == user.id) & (Block.blocked_id == user_id))
    )
    return {"ok": True}


@router.post("/{user_id}/report")
async def report_user(
    user_id: int, payload: ReportRequest, user: CurrentUser, session: SessionDep
) -> dict:
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot report yourself")
    await submit_report(
        session,
        reporter_id=user.id,
        target_id=user_id,
        reason=payload.reason,
        scope=payload.scope,
        scope_id=payload.scope_id,
        details=payload.details,
    )
    return {"ok": True}
