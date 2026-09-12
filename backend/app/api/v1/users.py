from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, desc, select

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.db.models import Block, Friendship, User, UserAchievement, UserStats
from app.realtime import presence
from app.schemas.user import (
    AchievementView,
    LeaderboardEntry,
    ProfileUpdate,
    ProfileView,
    PublicProfileView,
    ReportRequest,
)
from app.services import identity
from app.services.achievements import CATALOG
from app.services.moderation import submit_report
from app.services.economy import is_premium
from app.services.progression import describe, title_for_level
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
}

LEADERBOARD_FIELDS = {
    "xp": UserStats.xp,
    "rating": UserStats.rating,
    "voice": UserStats.voice_seconds,
    "games": UserStats.games_won,
    "streak": UserStats.best_streak,
}


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
            "uiLanguage": user.ui_language or "auto",
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
            if key in ALLOWED_PREFERENCES and isinstance(value, ALLOWED_PREFERENCES[key]):
                merged[key] = value
        user.preferences = merged
    if payload.palette is not None and payload.palette in ALLOWED_PALETTES:
        user.palette = payload.palette
    if payload.ui_language is not None and payload.ui_language in ("auto", "en", "ru"):
        user.ui_language = payload.ui_language
    if payload.regenerate_mask:
        seed = identity.new_seed()
        user.avatar_seed = seed
        user.anon_name = identity.mask_name(seed, user.language)
    await session.flush()
    return serialize_profile(user, await load_stats(session, user.id))


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
            "bio": target.bio,
            "level": stats.level,
            "title": title_for_level(stats.level),
            "interests": target.interests or [],
            "isOnline": await presence.is_online(target.id),
            "isFriend": friend.first() is not None,
        }
    )


@router.post("/{user_id}/block")
async def block_user(user_id: int, user: CurrentUser, session: SessionDep) -> dict:
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot block yourself")
    exists = await session.execute(
        select(Block.id).where((Block.blocker_id == user.id) & (Block.blocked_id == user_id))
    )
    if exists.first() is None:
        session.add(Block(blocker_id=user.id, blocked_id=user_id))
        await session.execute(
            delete(Friendship).where(
                ((Friendship.user_id == user.id) & (Friendship.friend_id == user_id))
                | ((Friendship.user_id == user_id) & (Friendship.friend_id == user.id))
            )
        )
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
