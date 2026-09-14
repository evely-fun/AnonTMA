from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentAdmin, CurrentUser, SessionDep, rate_limit_default
from app.services import admin as service

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(rate_limit_default)])


class ResolveRequest(BaseModel):
    action: str = Field(max_length=24)
    note: str | None = Field(default=None, max_length=500)


@router.get("/status")
async def status_check(user: CurrentUser) -> dict:
    from app.services import staff

    return {
        "admin": service.is_admin(user),
        "role": staff.role_of(user),
        "rights": sorted(staff.RIGHTS.get(staff.role_of(user), set())),
    }


@router.get("/overview")
async def overview(admin: CurrentAdmin, session: SessionDep) -> dict:
    return await service.overview(session)


@router.get("/cases")
async def cases(
    admin: CurrentAdmin,
    session: SessionDep,
    state: str = Query(default="open", pattern="^(open|resolved)$"),
    limit: int = Query(default=30, ge=1, le=100),
) -> dict:
    return {"cases": await service.queue(session, state, limit)}


@router.get("/cases/{case_id}")
async def case(case_id: int, admin: CurrentAdmin, session: SessionDep) -> dict:
    detail = await service.case_detail(session, case_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return detail


@router.post("/cases/{case_id}/resolve")
async def resolve(
    case_id: int, payload: ResolveRequest, admin: CurrentAdmin, session: SessionDep
) -> dict:
    result = await service.resolve(session, admin, case_id, payload.action, payload.note)
    if result is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown case or action")
    await session.flush()
    return result
