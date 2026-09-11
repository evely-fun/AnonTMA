import time

import orjson

from app.core.redis_client import get_redis
from app.realtime.hub import hub

PEERS_KEY = "rtc:peers:{user_id}"
CALL_KEY = "call:{call_id}"
USER_CALL_KEY = "call:user:{user_id}"
PEERS_TTL = 60 * 60 * 6
CALL_TTL = 120

SDP_LIMIT = 16000
CANDIDATE_LIMIT = 2000


async def link_peers(*user_ids: int) -> None:
    client = get_redis()
    pipeline = client.pipeline()
    for user_id in user_ids:
        others = [str(other) for other in user_ids if other != user_id]
        if not others:
            continue
        pipeline.sadd(PEERS_KEY.format(user_id=user_id), *others)
        pipeline.expire(PEERS_KEY.format(user_id=user_id), PEERS_TTL)
    await pipeline.execute()


async def unlink_peers(user_id: int, *others: int) -> None:
    client = get_redis()
    pipeline = client.pipeline()
    if others:
        pipeline.srem(PEERS_KEY.format(user_id=user_id), *[str(item) for item in others])
        for other in others:
            pipeline.srem(PEERS_KEY.format(user_id=other), str(user_id))
    else:
        pipeline.delete(PEERS_KEY.format(user_id=user_id))
    await pipeline.execute()


async def may_signal(user_id: int, peer_id: int) -> bool:
    return bool(await get_redis().sismember(PEERS_KEY.format(user_id=user_id), str(peer_id)))


def _trim(value: object, limit: int) -> str:
    return str(value or "")[:limit]


async def relay(user_id: int, kind: str, payload: dict) -> bool:
    peer_id = int(payload.get("to", 0) or 0)
    if peer_id <= 0 or not await may_signal(user_id, peer_id):
        return False

    if kind in ("offer", "answer"):
        body = {
            "type": payload.get("sdpType", kind),
            "sdp": _trim(payload.get("sdp"), SDP_LIMIT),
        }
        if not body["sdp"]:
            return False
        frame = {"type": f"rtc.{kind}", "payload": {"from": user_id, "description": body}}
    elif kind == "ice":
        candidate = payload.get("candidate") or {}
        frame = {
            "type": "rtc.ice",
            "payload": {
                "from": user_id,
                "candidate": {
                    "candidate": _trim(candidate.get("candidate"), CANDIDATE_LIMIT),
                    "sdpMid": _trim(candidate.get("sdpMid"), 64),
                    "sdpMLineIndex": int(candidate.get("sdpMLineIndex") or 0),
                },
            },
        }
    else:
        return False

    await hub.send_to_user(peer_id, frame)
    return True


async def create_call(caller_id: int, callee_id: int, mode: str) -> str:
    call_id = f"{caller_id}-{callee_id}-{int(time.time())}"
    client = get_redis()
    payload = {
        "id": call_id,
        "caller": caller_id,
        "callee": callee_id,
        "mode": mode,
        "status": "ringing",
        "createdAt": time.time(),
    }
    pipeline = client.pipeline()
    pipeline.set(CALL_KEY.format(call_id=call_id), orjson.dumps(payload), ex=CALL_TTL)
    pipeline.set(USER_CALL_KEY.format(user_id=caller_id), call_id, ex=CALL_TTL)
    pipeline.set(USER_CALL_KEY.format(user_id=callee_id), call_id, ex=CALL_TTL)
    await pipeline.execute()
    return call_id


async def read_call(call_id: str) -> dict | None:
    raw = await get_redis().get(CALL_KEY.format(call_id=call_id))
    return orjson.loads(raw) if raw else None


async def active_call(user_id: int) -> str | None:
    return await get_redis().get(USER_CALL_KEY.format(user_id=user_id))


async def close_call(call_id: str) -> dict | None:
    call = await read_call(call_id)
    client = get_redis()
    pipeline = client.pipeline()
    pipeline.delete(CALL_KEY.format(call_id=call_id))
    if call:
        pipeline.delete(USER_CALL_KEY.format(user_id=call["caller"]))
        pipeline.delete(USER_CALL_KEY.format(user_id=call["callee"]))
    await pipeline.execute()
    return call


async def mark_accepted(call_id: str) -> dict | None:
    call = await read_call(call_id)
    if call is None:
        return None
    call["status"] = "active"
    call["acceptedAt"] = time.time()
    client = get_redis()
    pipeline = client.pipeline()
    pipeline.set(CALL_KEY.format(call_id=call_id), orjson.dumps(call), ex=60 * 60 * 4)
    pipeline.expire(USER_CALL_KEY.format(user_id=call["caller"]), 60 * 60 * 4)
    pipeline.expire(USER_CALL_KEY.format(user_id=call["callee"]), 60 * 60 * 4)
    await pipeline.execute()
    return call
