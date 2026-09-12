import time

import orjson
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import get_redis
from app.db.base import utcnow
from app.db.models import Room, RoomMember, User, UserStats
from app.realtime.hub import hub

MEMBERS_KEY = "room:{room_id}:members"
USER_ROOM_KEY = "room:user:{user_id}"
BANNED_KEY = "room:{room_id}:banned"
ROOM_TTL = 60 * 60 * 12
KICK_TTL = 60 * 15


def topic(room_id: int) -> str:
    return f"room:{room_id}"


async def member_map(room_id: int) -> dict[int, dict]:
    raw = await get_redis().hgetall(MEMBERS_KEY.format(room_id=room_id))
    return {int(key): orjson.loads(value) for key, value in raw.items()}


async def population(room_id: int) -> int:
    return int(await get_redis().hlen(MEMBERS_KEY.format(room_id=room_id)))


async def populations(room_ids: list[int]) -> dict[int, int]:
    if not room_ids:
        return {}
    client = get_redis()
    pipeline = client.pipeline()
    for room_id in room_ids:
        pipeline.hlen(MEMBERS_KEY.format(room_id=room_id))
    counts = await pipeline.execute()
    return dict(zip(room_ids, [int(value) for value in counts], strict=True))


async def current_room(user_id: int) -> int | None:
    raw = await get_redis().get(USER_ROOM_KEY.format(user_id=user_id))
    return int(raw) if raw else None


async def is_kicked(room_id: int, user_id: int) -> bool:
    return bool(await get_redis().sismember(BANNED_KEY.format(room_id=room_id), str(user_id)))


async def kick(room_id: int, user_id: int) -> None:
    client = get_redis()
    pipeline = client.pipeline()
    pipeline.sadd(BANNED_KEY.format(room_id=room_id), str(user_id))
    pipeline.expire(BANNED_KEY.format(room_id=room_id), KICK_TTL)
    await pipeline.execute()


async def join(session: AsyncSession, room: Room, user: User) -> dict:
    client = get_redis()
    stats = await session.get(UserStats, user.id)
    entry = {
        "userId": user.id,
        "anonName": user.anon_name,
        "avatarSeed": user.avatar_seed,
        "level": stats.level if stats else 1,
        "role": "host" if room.owner_id == user.id else "member",
        "muted": False,
        "forcedMute": False,
        "hand": False,
        "joinedAt": time.time(),
    }
    pipeline = client.pipeline()
    pipeline.hset(MEMBERS_KEY.format(room_id=room.id), str(user.id), orjson.dumps(entry))
    pipeline.expire(MEMBERS_KEY.format(room_id=room.id), ROOM_TTL)
    pipeline.set(USER_ROOM_KEY.format(user_id=user.id), room.id, ex=ROOM_TTL)
    await pipeline.execute()

    existing = await session.execute(
        select(RoomMember).where(
            (RoomMember.room_id == room.id) & (RoomMember.user_id == user.id)
        )
    )
    record = existing.scalar_one_or_none()
    if record is None:
        session.add(RoomMember(room_id=room.id, user_id=user.id, role=entry["role"]))
    else:
        record.left_at = None
    await session.flush()
    return entry


async def leave(session: AsyncSession, room_id: int, user_id: int) -> int:
    client = get_redis()
    pipeline = client.pipeline()
    pipeline.hdel(MEMBERS_KEY.format(room_id=room_id), str(user_id))
    pipeline.delete(USER_ROOM_KEY.format(user_id=user_id))
    await pipeline.execute()

    rows = await session.execute(
        select(RoomMember).where((RoomMember.room_id == room_id) & (RoomMember.user_id == user_id))
    )
    record = rows.scalar_one_or_none()
    if record is not None:
        record.left_at = utcnow()

    remaining = await population(room_id)
    if remaining == 0:
        room = await session.get(Room, room_id)
        if room is not None:
            room.is_active = False
            room.closed_at = utcnow()
    await session.flush()
    return remaining


async def update_member(room_id: int, user_id: int, **changes) -> dict | None:
    client = get_redis()
    raw = await client.hget(MEMBERS_KEY.format(room_id=room_id), str(user_id))
    if raw is None:
        return None
    entry = orjson.loads(raw)
    entry.update(changes)
    await client.hset(MEMBERS_KEY.format(room_id=room_id), str(user_id), orjson.dumps(entry))
    return entry


async def broadcast_roster(room_id: int) -> None:
    members = await member_map(room_id)
    await hub.broadcast(
        topic(room_id),
        {
            "type": "room.roster",
            "payload": {"roomId": room_id, "members": list(members.values())},
        },
    )
