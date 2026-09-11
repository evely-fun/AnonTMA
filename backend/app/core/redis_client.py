from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis.asyncio as redis

from app.core.config import settings

_pool: redis.ConnectionPool | None = None


def get_redis() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = redis.ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=64,
            health_check_interval=30,
        )
    return redis.Redis(connection_pool=_pool)


@asynccontextmanager
async def redis_pubsub(*channels: str) -> AsyncIterator[redis.client.PubSub]:
    client = get_redis()
    pubsub = client.pubsub(ignore_subscribe_messages=True)
    await pubsub.subscribe(*channels)
    try:
        yield pubsub
    finally:
        await pubsub.unsubscribe(*channels)
        await pubsub.aclose()


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
