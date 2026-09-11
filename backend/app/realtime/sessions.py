import time

import orjson
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import get_redis
from app.db.base import utcnow
from app.db.models import Dialog, Message, UserStats
from app.services import identity
from app.services.progression import dialog_reward
from app.services.users import award

DIALOG_KEY = "dialog:{dialog_id}"
USER_DIALOG_KEY = "dialog:user:{user_id}"
LIKES_KEY = "dialog:likes:{dialog_id}"
DIALOG_TTL = 60 * 60 * 6


def mask_for(dialog_id: int, user_id: int, language: str = "en") -> dict:
    seed = f"{dialog_id}:{user_id}"
    return {
        "name": identity.mask_name(seed, language),
        "seed": identity.stable_seed(seed),
        "style": identity.avatar_style(seed),
    }


async def create_dialog(
    session: AsyncSession, a_id: int, b_id: int, mode: str, language: str = "en"
) -> Dialog:
    dialog = Dialog(a_user_id=a_id, b_user_id=b_id, mode=mode, started_at=utcnow())
    session.add(dialog)
    await session.flush()

    client = get_redis()
    state = {
        "id": dialog.id,
        "a": a_id,
        "b": b_id,
        "mode": mode,
        "startedAt": time.time(),
        "language": language,
    }
    pipeline = client.pipeline()
    pipeline.set(DIALOG_KEY.format(dialog_id=dialog.id), orjson.dumps(state), ex=DIALOG_TTL)
    pipeline.set(USER_DIALOG_KEY.format(user_id=a_id), dialog.id, ex=DIALOG_TTL)
    pipeline.set(USER_DIALOG_KEY.format(user_id=b_id), dialog.id, ex=DIALOG_TTL)
    if mode == "voice":
        pipeline.incrby("metrics:in_voice", 2)
    await pipeline.execute()
    return dialog


async def active_dialog_id(user_id: int) -> int | None:
    raw = await get_redis().get(USER_DIALOG_KEY.format(user_id=user_id))
    return int(raw) if raw else None


async def read_state(dialog_id: int) -> dict | None:
    raw = await get_redis().get(DIALOG_KEY.format(dialog_id=dialog_id))
    return orjson.loads(raw) if raw else None


def partner_of(state: dict, user_id: int) -> int | None:
    if state["a"] == user_id:
        return int(state["b"])
    if state["b"] == user_id:
        return int(state["a"])
    return None


async def store_message(
    session: AsyncSession, dialog_id: int, sender_id: int, kind: str, body: str, meta: dict
) -> Message:
    message = Message(
        scope="dialog",
        scope_id=dialog_id,
        sender_id=sender_id,
        kind=kind,
        body=body,
        meta=meta,
        created_at=utcnow(),
    )
    session.add(message)
    stats = await session.get(UserStats, sender_id)
    if stats:
        stats.messages_sent += 1
    await session.flush()
    return message


async def end_dialog(session: AsyncSession, dialog_id: int, ended_by: int | None) -> dict:
    state = await read_state(dialog_id)
    dialog = await session.get(Dialog, dialog_id)
    if dialog is None:
        return {}

    client = get_redis()
    duration = 0
    if state:
        duration = max(0, int(time.time() - float(state.get("startedAt", time.time()))))
        pipeline = client.pipeline()
        pipeline.delete(DIALOG_KEY.format(dialog_id=dialog_id))
        pipeline.delete(USER_DIALOG_KEY.format(user_id=state["a"]))
        pipeline.delete(USER_DIALOG_KEY.format(user_id=state["b"]))
        if state.get("mode") == "voice":
            pipeline.decrby("metrics:in_voice", 2)
        await pipeline.execute()

    if dialog.ended_at is not None:
        return {"dialogId": dialog_id, "durationSeconds": dialog.duration_seconds, "rewards": {}}

    dialog.ended_at = utcnow()
    dialog.ended_by_id = ended_by
    dialog.duration_seconds = duration

    rewards: dict[int, dict] = {}
    for user_id, liked in (
        (dialog.a_user_id, dialog.a_liked),
        (dialog.b_user_id, dialog.b_liked),
    ):
        stats = await session.get(UserStats, user_id)
        if stats:
            stats.dialogs_total += 1
            if dialog.mode == "voice":
                stats.voice_seconds += duration
        xp, coins = dialog_reward(duration, liked, dialog.mode)
        rewards[user_id] = await award(session, user_id, xp=xp, coins=coins)

    await session.flush()
    return {
        "dialogId": dialog_id,
        "durationSeconds": duration,
        "mode": dialog.mode,
        "rewards": rewards,
        "mutualLike": dialog.a_liked and dialog.b_liked,
    }


async def set_like(session: AsyncSession, dialog_id: int, user_id: int) -> bool:
    dialog = await session.get(Dialog, dialog_id)
    if dialog is None:
        return False
    if dialog.a_user_id == user_id:
        dialog.a_liked = True
    elif dialog.b_user_id == user_id:
        dialog.b_liked = True
    else:
        return False

    client = get_redis()
    key = LIKES_KEY.format(dialog_id=dialog_id)
    pipeline = client.pipeline()
    pipeline.sadd(key, str(user_id))
    pipeline.expire(key, DIALOG_TTL)
    pipeline.scard(key)
    results = await pipeline.execute()
    mutual = int(results[-1]) >= 2

    partner_id = dialog.b_user_id if dialog.a_user_id == user_id else dialog.a_user_id
    stats = await session.get(UserStats, partner_id)
    if stats:
        stats.likes_received += 1
    await session.flush()
    return mutual
