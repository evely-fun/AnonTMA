from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.models import (
    SupportMessage,
    SupportTicket,
    TicketState,
    TicketTopic,
    User,
)
from app.services import staff

MAX_OPEN_PER_USER = 5
MAX_BODY = 2000


async def open_ticket(
    session: AsyncSession, author: User, topic: str, subject: str, body: str
) -> tuple[SupportTicket | None, str]:
    if topic not in set(TicketTopic):
        return None, "unknown_topic"
    body = body.strip()[:MAX_BODY]
    if not body:
        return None, "empty"

    open_count = await session.execute(
        select(func.count(SupportTicket.id)).where(
            (SupportTicket.author_id == author.id)
            & (SupportTicket.state != TicketState.closed)
        )
    )
    if int(open_count.scalar() or 0) >= MAX_OPEN_PER_USER:
        return None, "too_many_open"

    ticket = SupportTicket(
        author_id=author.id,
        topic=topic,
        subject=subject.strip()[:120] or body[:60],
        state=TicketState.open,
        last_message_at=utcnow(),
        unread_for_staff=True,
    )
    session.add(ticket)
    await session.flush()
    session.add(
        SupportMessage(ticket_id=ticket.id, author_id=author.id, from_staff=False, body=body)
    )
    return ticket, "ok"


async def reply(
    session: AsyncSession, ticket: SupportTicket, author: User, body: str
) -> tuple[bool, str]:
    body = body.strip()[:MAX_BODY]
    if not body:
        return False, "empty"
    if ticket.state == TicketState.closed:
        return False, "closed"

    from_staff = author.id != ticket.author_id
    if from_staff and not _may_handle(author, ticket):
        return False, "not_allowed"

    session.add(
        SupportMessage(
            ticket_id=ticket.id, author_id=author.id, from_staff=from_staff, body=body
        )
    )
    ticket.last_message_at = utcnow()
    if from_staff:
        ticket.state = TicketState.answered
        ticket.unread_for_author = True
        ticket.unread_for_staff = False
        if ticket.assignee_id is None:
            ticket.assignee_id = author.id
    else:
        ticket.state = TicketState.open
        ticket.unread_for_staff = True
        ticket.unread_for_author = False
    return True, "ok"


def _may_handle(user: User, ticket: SupportTicket) -> bool:
    return ticket.topic in staff.topics_for(user)


async def close(session: AsyncSession, ticket: SupportTicket, actor: User) -> bool:
    if actor.id != ticket.author_id and not _may_handle(actor, ticket):
        return False
    ticket.state = TicketState.closed
    ticket.closed_at = utcnow()
    ticket.unread_for_staff = False
    return True


async def mine(session: AsyncSession, user: User) -> list[dict]:
    rows = await session.execute(
        select(SupportTicket)
        .where(SupportTicket.author_id == user.id)
        .order_by(SupportTicket.last_message_at.desc().nullslast(), SupportTicket.id.desc())
        .limit(40)
    )
    return [_card(ticket, for_staff=False) for ticket in rows.scalars()]


async def queue(session: AsyncSession, user: User, state: str | None = None) -> list[dict]:
    topics = staff.topics_for(user)
    if not topics:
        return []
    query = select(SupportTicket).where(SupportTicket.topic.in_(topics))
    if state and state != "all":
        query = query.where(SupportTicket.state == state)
    else:
        query = query.where(SupportTicket.state != TicketState.closed)
    rows = await session.execute(
        query.order_by(
            SupportTicket.unread_for_staff.desc(),
            SupportTicket.last_message_at.desc().nullslast(),
        ).limit(60)
    )
    return [_card(ticket, for_staff=True) for ticket in rows.scalars()]


async def thread(session: AsyncSession, ticket: SupportTicket, reader: User) -> list[dict]:
    rows = await session.execute(
        select(SupportMessage)
        .where(SupportMessage.ticket_id == ticket.id)
        .order_by(SupportMessage.id)
        .limit(200)
    )
    if reader.id == ticket.author_id:
        ticket.unread_for_author = False
    elif _may_handle(reader, ticket):
        ticket.unread_for_staff = False
    return [
        {
            "id": message.id,
            "authorId": message.author_id,
            "fromStaff": message.from_staff,
            "mine": message.author_id == reader.id,
            "body": message.body,
            "createdAt": message.created_at.isoformat() if message.created_at else None,
        }
        for message in rows.scalars()
    ]


def _card(ticket: SupportTicket, for_staff: bool) -> dict:
    return {
        "id": ticket.id,
        "topic": ticket.topic,
        "subject": ticket.subject,
        "state": ticket.state,
        "authorId": ticket.author_id,
        "assigneeId": ticket.assignee_id,
        "unread": ticket.unread_for_staff if for_staff else ticket.unread_for_author,
        "lastMessageAt": ticket.last_message_at.isoformat() if ticket.last_message_at else None,
    }
