from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.core.config import settings
from app.db.models import UserStats
from app.services import economy, payments

router = APIRouter(prefix="/economy", tags=["economy"], dependencies=[Depends(rate_limit_default)])


async def _stats(session: SessionDep, user_id: int) -> UserStats:
    stats = await session.get(UserStats, user_id)
    if stats is None:
        stats = UserStats(user_id=user_id)
        session.add(stats)
        await session.flush()
    return stats


@router.get("/state")
async def state(user: CurrentUser, session: SessionDep) -> dict:
    stats = await _stats(session, user.id)
    return economy.state_payload(user, stats)


@router.post("/wheel/spin")
async def spin(user: CurrentUser, session: SessionDep) -> dict:
    stats = await _stats(session, user.id)
    economy.regenerate(stats, economy.is_premium(user))
    result = await economy.spin_wheel(session, user, stats)
    if result is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No spins available")
    await session.flush()
    return {"result": result, "state": economy.state_payload(user, stats)}


@router.post("/streak/claim")
async def claim_streak(user: CurrentUser, session: SessionDep) -> dict:
    stats = await _stats(session, user.id)
    economy.regenerate(stats, economy.is_premium(user))
    reward = await economy.claim_streak(session, user, stats)
    if reward is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already claimed today")
    await session.flush()
    return {"reward": reward, "state": economy.state_payload(user, stats)}


@router.get("/products")
async def products(user: CurrentUser) -> dict:
    return {"mode": settings.payments_mode, "products": payments.catalog_payload()}


@router.post("/purchase/{product_key}")
async def purchase(product_key: str, user: CurrentUser, session: SessionDep) -> dict:
    result = await payments.start_purchase(session, user, product_key[:32])
    if "error" in result:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, result["error"])
    await session.flush()
    stats = await _stats(session, user.id)
    return {**result, "state": economy.state_payload(user, stats)}
