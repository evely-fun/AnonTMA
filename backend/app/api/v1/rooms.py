import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep, rate_limit_default
from app.core.config import settings
from app.db.base import utcnow
from app.db.models import Room, RoomKind, RoomVisibility
from app.realtime import rooms as runtime
from app.schemas.social import RoomCreate, RoomView

router = APIRouter(prefix="/rooms", tags=["rooms"], dependencies=[Depends(rate_limit_default)])
MAX_OWNED_ROOMS = 3


def _serialize(room: Room, participants: int, members: list[dict] | None = None) -> RoomView:
    return RoomView.model_validate(
        {
            "id": room.id,
            "code": room.code,
            "title": room.title,
            "topic": room.topic,
            "emoji": room.emoji,
            "kind": room.kind,
            "visibility": room.visibility,
            "language": room.language,
            "gameKey": room.game_key,
            "ownerId": room.owner_id,
            "maxParticipants": room.max_participants,
            "participants": participants,
            "members": members or [],
            "createdAt": room.created_at,
        }
    )


@router.get("", response_model=list[RoomView])
async def list_rooms(
    user: CurrentUser,
    session: SessionDep,
    kind: str | None = Query(default=None),
    language: str | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=80),
) -> list[RoomView]:
    query = (
        select(Room)
        .where(Room.is_active.is_(True), Room.visibility == RoomVisibility.public)
        .order_by(Room.created_at.desc())
        .limit(limit)
    )
    if kind:
        query = query.where(Room.kind == kind)
    if language and language != "any":
        query = query.where(Room.language == language)

    rows = list((await session.execute(query)).scalars())
    counts = await runtime.populations([room.id for room in rows])
    views = [_serialize(room, counts.get(room.id, 0)) for room in rows]
    views.sort(key=lambda item: (item.participants == 0, -item.participants))
    return views


@router.post("", response_model=RoomView, status_code=status.HTTP_201_CREATED)
async def create_room(payload: RoomCreate, user: CurrentUser, session: SessionDep) -> RoomView:
    owned = await session.execute(
        select(Room).where(Room.owner_id == user.id, Room.is_active.is_(True))
    )
    active = list(owned.scalars())
    if len(active) >= MAX_OWNED_ROOMS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many open rooms")

    kind = payload.kind if payload.kind in tuple(RoomKind) else RoomKind.voice
    visibility = (
        payload.visibility if payload.visibility in tuple(RoomVisibility) else RoomVisibility.public
    )
    room = Room(
        code=secrets.token_urlsafe(6)[:8],
        title=payload.title.strip(),
        topic=(payload.topic or "").strip() or None,
        emoji=payload.emoji,
        kind=kind,
        visibility=visibility,
        owner_id=user.id,
        max_participants=min(payload.max_participants, settings.max_room_participants),
        language=payload.language,
        game_key=payload.game_key,
    )
    session.add(room)
    await session.flush()
    return _serialize(room, 0)


@router.get("/{room_id}", response_model=RoomView)
async def read_room(room_id: int, user: CurrentUser, session: SessionDep) -> RoomView:
    room = await session.get(Room, room_id)
    if room is None or not room.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    members = await runtime.member_map(room.id)
    return _serialize(room, len(members), list(members.values()))


@router.get("/code/{code}", response_model=RoomView)
async def read_room_by_code(code: str, user: CurrentUser, session: SessionDep) -> RoomView:
    rows = await session.execute(select(Room).where(Room.code == code[:12], Room.is_active.is_(True)))
    room = rows.scalar_one_or_none()
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    members = await runtime.member_map(room.id)
    return _serialize(room, len(members), list(members.values()))


@router.delete("/{room_id}")
async def close_room(room_id: int, user: CurrentUser, session: SessionDep) -> dict:
    room = await session.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    if room.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the host can close the room")
    room.is_active = False
    room.closed_at = utcnow()
    return {"ok": True}
