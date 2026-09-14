from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.db.models import SupportTicket, TicketState
from app.services import staff, support

router = APIRouter(prefix="/support", tags=["support"], dependencies=[Depends(rate_limit_default)])


class OpenRequest(BaseModel):
    topic: str = Field(max_length=16)
    subject: str = Field(default="", max_length=120)
    body: str = Field(max_length=2000)


class ReplyRequest(BaseModel):
    body: str = Field(max_length=2000)


class RoleRequest(BaseModel):
    userId: int
    role: str = Field(max_length=16)


@router.get("/me")
async def my_tickets(user: CurrentUser, session: SessionDep) -> dict:
    return {
        "tickets": await support.mine(session, user),
        "role": staff.role_of(user),
        "canHandle": sorted(staff.topics_for(user)),
    }


@router.post("/tickets", status_code=status.HTTP_201_CREATED)
async def open_ticket(payload: OpenRequest, user: CurrentUser, session: SessionDep) -> dict:
    ticket, reason = await support.open_ticket(
        session, user, payload.topic, payload.subject, payload.body
    )
    if ticket is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason)
    await session.flush()
    return {"id": ticket.id, "topic": ticket.topic, "state": ticket.state}


@router.get("/tickets/{ticket_id}")
async def read_ticket(ticket_id: int, user: CurrentUser, session: SessionDep) -> dict:
    ticket = await _readable(session, ticket_id, user)
    return {
        "id": ticket.id,
        "topic": ticket.topic,
        "subject": ticket.subject,
        "state": ticket.state,
        "authorId": ticket.author_id,
        "mine": ticket.author_id == user.id,
        "messages": await support.thread(session, ticket, user),
    }


@router.post("/tickets/{ticket_id}/reply")
async def reply(
    ticket_id: int, payload: ReplyRequest, user: CurrentUser, session: SessionDep
) -> dict:
    ticket = await _readable(session, ticket_id, user)
    ok, reason = await support.reply(session, ticket, user, payload.body)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason)
    return {"state": ticket.state}


@router.post("/tickets/{ticket_id}/close")
async def close(ticket_id: int, user: CurrentUser, session: SessionDep) -> dict:
    ticket = await _readable(session, ticket_id, user)
    if not await support.close(session, ticket, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    return {"state": TicketState.closed}


@router.get("/queue")
async def queue(
    user: CurrentUser,
    session: SessionDep,
    state: str = Query(default="open", pattern="^(open|answered|closed|all)$"),
) -> dict:
    if not staff.topics_for(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not support staff")
    return {"tickets": await support.queue(session, user, state)}


@router.get("/staff")
async def roster(user: CurrentUser, session: SessionDep) -> dict:
    if not staff.can(user, "staff.assign"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    return {"staff": await staff.roster(session)}


@router.post("/staff")
async def assign(payload: RoleRequest, user: CurrentUser, session: SessionDep) -> dict:
    ok, reason = await staff.set_role(session, user, payload.userId, payload.role)
    if not ok:
        raise HTTPException(status.HTTP_403_FORBIDDEN, reason)
    return {"userId": payload.userId, "role": reason}


async def _readable(session: SessionDep, ticket_id: int, user: CurrentUser) -> SupportTicket:
    ticket = await session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    if ticket.author_id != user.id and ticket.topic not in staff.topics_for(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    return ticket
