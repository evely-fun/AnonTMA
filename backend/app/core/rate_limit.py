import time

from fastapi import HTTPException, status

from app.core.redis_client import get_redis

_SCRIPT = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local bucket = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local ts = tonumber(bucket[2])
if tokens == nil then
  tokens = capacity
  ts = now
end
local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + elapsed * refill)
local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, math.ceil(capacity / refill) + 60)
return {allowed, math.floor(tokens)}
"""

_sha: str | None = None


async def consume(bucket: str, capacity: int, per_seconds: int, cost: int = 1) -> bool:
    global _sha
    client = get_redis()
    refill = capacity / max(per_seconds, 1)
    now = time.time()
    try:
        if _sha is None:
            _sha = await client.script_load(_SCRIPT)
        allowed, _ = await client.evalsha(_sha, 1, f"rl:{bucket}", capacity, refill, now, cost)
    except Exception:
        _sha = None
        try:
            allowed, _ = await client.eval(_SCRIPT, 1, f"rl:{bucket}", capacity, refill, now, cost)
        except Exception:
            return True
    return bool(int(allowed))


async def enforce(bucket: str, capacity: int, per_seconds: int, cost: int = 1) -> None:
    if not await consume(bucket, capacity, per_seconds, cost):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, slow down",
        )
