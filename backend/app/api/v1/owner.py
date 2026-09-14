from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.services import notices, owner, staff

router = APIRouter(prefix="/owner", tags=["owner"], dependencies=[Depends(rate_limit_default)])


class GrantRequest(BaseModel):
    userId: int
    items: list[str] = Field(default_factory=list, max_length=6)
    coins: int = 0
    energy: int = 0
    premiumDays: int = 0
    note: str | None = Field(default=None, max_length=200)


class CodeRequest(BaseModel):
    items: list[str] = Field(default_factory=list, max_length=6)
    coins: int = 0
    premiumDays: int = 0
    maxUses: int = 1
    daysValid: int = 30
    note: str | None = Field(default=None, max_length=120)


class RedeemRequest(BaseModel):
    code: str = Field(max_length=24)


class SeenRequest(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=50)


def _panel(user: CurrentUser) -> None:
    if not staff.can(user, "owner.panel"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")


@router.get("/overview")
async def overview(user: CurrentUser, session: SessionDep) -> dict:
    _panel(user)
    return {
        "role": staff.role_of(user),
        "catalogue": owner.catalogue(),
        "codes": await owner.codes(session),
        "ledger": await owner.ledger(session),
    }


@router.get("/people")
async def people(
    user: CurrentUser,
    session: SessionDep,
    query: str = Query(default="", max_length=48),
) -> dict:
    _panel(user)
    return {"people": await owner.find(session, query)}


@router.post("/grant")
async def grant(payload: GrantRequest, user: CurrentUser, session: SessionDep) -> dict:
    _panel(user)
    ok, reason, given = await owner.grant(
        session,
        user,
        payload.userId,
        payload.items,
        payload.coins,
        payload.energy,
        payload.premiumDays,
        payload.note,
    )
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason)
    return {"granted": given}


@router.post("/codes", status_code=status.HTTP_201_CREATED)
async def create_code(payload: CodeRequest, user: CurrentUser, session: SessionDep) -> dict:
    _panel(user)
    code, reason = await owner.create_code(
        session,
        user,
        payload.items,
        payload.coins,
        payload.premiumDays,
        payload.maxUses,
        payload.daysValid,
        payload.note,
    )
    if code is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason)
    return {"code": code.code, "id": code.id}


@router.post("/codes/{code_id}/revoke")
async def revoke(code_id: int, user: CurrentUser, session: SessionDep) -> dict:
    _panel(user)
    if not await owner.revoke_code(session, user, code_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such code")
    return {"revoked": code_id}


# Redeeming is open to everyone: a code is the anonymous half of a grant.
@router.post("/redeem")
async def redeem(payload: RedeemRequest, user: CurrentUser, session: SessionDep) -> dict:
    ok, reason, given = await owner.redeem(session, user, payload.code)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason)
    return {"granted": given}


@router.get("/notices")
async def inbox(user: CurrentUser, session: SessionDep) -> dict:
    return {"notices": await notices.unread(session, user.id)}


@router.post("/notices/seen")
async def seen(payload: SeenRequest, user: CurrentUser, session: SessionDep) -> dict:
    return {"seen": await notices.mark_seen(session, user.id, payload.ids)}
