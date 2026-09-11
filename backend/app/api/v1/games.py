from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, select

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.db.models import GameResult, User
from app.games.registry import catalog_payload
from app.schemas.user import LeaderboardEntry

router = APIRouter(prefix="/games", tags=["games"], dependencies=[Depends(rate_limit_default)])


@router.get("")
async def catalog(user: CurrentUser) -> dict:
    return {"games": catalog_payload()}


@router.get("/history")
async def history(
    user: CurrentUser, session: SessionDep, limit: int = Query(default=20, ge=1, le=50)
) -> dict:
    rows = await session.execute(
        select(GameResult)
        .where(GameResult.user_id == user.id)
        .order_by(desc(GameResult.created_at))
        .limit(limit)
    )
    return {
        "items": [
            {
                "gameKey": item.game_key,
                "score": item.score,
                "placement": item.placement,
                "won": item.won,
                "xp": item.xp_awarded,
                "coins": item.coins_awarded,
                "createdAt": item.created_at,
            }
            for item in rows.scalars()
        ]
    }


@router.get("/summary")
async def summary(user: CurrentUser, session: SessionDep) -> dict:
    rows = await session.execute(
        select(
            GameResult.game_key,
            func.count(GameResult.id),
            func.sum(case((GameResult.won.is_(True), 1), else_=0)),
            func.max(GameResult.score),
        )
        .where(GameResult.user_id == user.id)
        .group_by(GameResult.game_key)
    )
    return {
        "items": [
            {
                "gameKey": key,
                "played": int(played or 0),
                "won": int(won or 0),
                "best": int(best or 0),
            }
            for key, played, won, best in rows.all()
        ]
    }


@router.get("/{game_key}/leaderboard", response_model=list[LeaderboardEntry])
async def game_leaderboard(
    game_key: str,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=25, ge=5, le=100),
) -> list[LeaderboardEntry]:
    aggregate = func.max(GameResult.score).label("value")
    rows = await session.execute(
        select(User, aggregate)
        .join(GameResult, GameResult.user_id == User.id)
        .where(GameResult.game_key == game_key[:32])
        .group_by(User.id)
        .order_by(desc(aggregate))
        .limit(limit)
    )
    entries: list[LeaderboardEntry] = []
    for index, (row_user, value) in enumerate(rows.all(), start=1):
        entries.append(
            LeaderboardEntry.model_validate(
                {
                    "rank": index,
                    "userId": row_user.id,
                    "anonName": row_user.anon_name,
                    "avatarSeed": row_user.avatar_seed,
                    "level": row_user.stats.level if row_user.stats else 1,
                    "value": int(value or 0),
                    "isMe": row_user.id == user.id,
                }
            )
        )
    return entries
