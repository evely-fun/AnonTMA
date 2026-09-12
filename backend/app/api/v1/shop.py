from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.db.models import UserStats
from app.services import shop

router = APIRouter(prefix="/shop", tags=["shop"], dependencies=[Depends(rate_limit_default)])

ERRORS = {
    "unknown_item": status.HTTP_404_NOT_FOUND,
    "already_owned": status.HTTP_409_CONFLICT,
    "not_owned": status.HTTP_409_CONFLICT,
    "not_enough_coins": status.HTTP_402_PAYMENT_REQUIRED,
    "no_stats": status.HTTP_409_CONFLICT,
}


async def _coins(session: SessionDep, user_id: int) -> int:
    stats = await session.get(UserStats, user_id)
    return stats.coins if stats else 0


@router.get("/catalog")
async def catalog(user: CurrentUser, session: SessionDep) -> dict:
    owned = await shop.owned_keys(session, user.id)
    coins = await _coins(session, user.id)
    return {
        "coins": coins,
        "equipped": shop.equipped_of(user),
        "items": shop.catalog_payload(owned, coins),
    }


@router.post("/buy/{item_key:path}")
async def buy(item_key: str, user: CurrentUser, session: SessionDep) -> dict:
    result = await shop.buy(session, user, item_key[:48])
    if "error" in result:
        raise HTTPException(ERRORS.get(result["error"], 400), result["error"])
    await session.flush()
    return {**result, "equipped": shop.equipped_of(user)}


@router.post("/equip/{item_key:path}")
async def equip(item_key: str, user: CurrentUser, session: SessionDep) -> dict:
    result = await shop.equip(session, user, item_key[:48])
    if "error" in result:
        raise HTTPException(ERRORS.get(result["error"], 400), result["error"])
    return result
