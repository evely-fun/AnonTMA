import time

from app.core.redis_client import get_redis

ONLINE_KEY = "presence:online"
ACTIVITY_KEY = "presence:activity"
SESSION_KEY = "presence:sessions:{user_id}"
HEARTBEAT_TTL = 75


async def mark_online(user_id: int, connection_id: str, activity: str = "idle") -> int:
    client = get_redis()
    now = time.time()
    pipeline = client.pipeline()
    pipeline.zadd(ONLINE_KEY, {str(user_id): now})
    pipeline.hset(ACTIVITY_KEY, str(user_id), activity)
    pipeline.sadd(SESSION_KEY.format(user_id=user_id), connection_id)
    pipeline.expire(SESSION_KEY.format(user_id=user_id), HEARTBEAT_TTL * 4)
    await pipeline.execute()
    return await count_online()


async def heartbeat(user_id: int) -> None:
    await get_redis().zadd(ONLINE_KEY, {str(user_id): time.time()})


async def set_activity(user_id: int, activity: str) -> None:
    await get_redis().hset(ACTIVITY_KEY, str(user_id), activity)


async def mark_offline(user_id: int, connection_id: str) -> bool:
    client = get_redis()
    key = SESSION_KEY.format(user_id=user_id)
    await client.srem(key, connection_id)
    remaining = await client.scard(key)
    if remaining <= 0:
        pipeline = client.pipeline()
        pipeline.zrem(ONLINE_KEY, str(user_id))
        pipeline.hdel(ACTIVITY_KEY, str(user_id))
        pipeline.delete(key)
        await pipeline.execute()
        return True
    return False


async def prune() -> None:
    cutoff = time.time() - HEARTBEAT_TTL
    stale = await get_redis().zrangebyscore(ONLINE_KEY, "-inf", cutoff)
    if stale:
        pipeline = get_redis().pipeline()
        pipeline.zremrangebyscore(ONLINE_KEY, "-inf", cutoff)
        pipeline.hdel(ACTIVITY_KEY, *stale)
        await pipeline.execute()


async def count_online() -> int:
    cutoff = time.time() - HEARTBEAT_TTL
    return int(await get_redis().zcount(ONLINE_KEY, cutoff, "+inf"))


async def is_online(user_id: int) -> bool:
    score = await get_redis().zscore(ONLINE_KEY, str(user_id))
    return bool(score and score > time.time() - HEARTBEAT_TTL)


async def filter_online(user_ids: list[int]) -> set[int]:
    if not user_ids:
        return set()
    client = get_redis()
    pipeline = client.pipeline()
    for user_id in user_ids:
        pipeline.zscore(ONLINE_KEY, str(user_id))
    scores = await pipeline.execute()
    cutoff = time.time() - HEARTBEAT_TTL
    return {
        user_id for user_id, score in zip(user_ids, scores, strict=True) if score and score > cutoff
    }


async def activities(user_ids: list[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    values = await get_redis().hmget(ACTIVITY_KEY, [str(item) for item in user_ids])
    return {
        user_id: value
        for user_id, value in zip(user_ids, values, strict=True)
        if value is not None
    }


async def snapshot() -> dict[str, int]:
    online = await count_online()
    client = get_redis()
    in_voice = int(await client.get("metrics:in_voice") or 0)
    searching = int(await client.zcard("matchmaking:queue:voice") or 0) + int(
        await client.zcard("matchmaking:queue:text") or 0
    )
    return {"online": online, "inVoice": in_voice, "searching": searching}
