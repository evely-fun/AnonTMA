import time
import uuid
from dataclasses import asdict, dataclass, field

import orjson

from app.core.redis_client import get_redis

QUEUE_KEY = "matchmaking:queue:{mode}"
META_KEY = "matchmaking:meta:{mode}:{user_id}"
LOCK_KEY = "matchmaking:lock:{mode}"
RECENT_KEY = "matchmaking:recent:{low}:{high}"
RECENT_TTL = 900
META_TTL = 600
SCAN_LIMIT = 60


@dataclass(slots=True)
class Ticket:
    user_id: int
    mode: str
    language: str = "en"
    gender: str = "unknown"
    want_language: str = "any"
    want_gender: str = "any"
    interests: list[str] = field(default_factory=list)
    blocked: list[int] = field(default_factory=list)
    joined_at: float = 0.0

    def to_json(self) -> str:
        return orjson.dumps(asdict(self)).decode()

    @staticmethod
    def from_json(raw: str) -> "Ticket":
        return Ticket(**orjson.loads(raw))


def _recent_key(first: int, second: int) -> str:
    low, high = sorted((first, second))
    return RECENT_KEY.format(low=low, high=high)


def _compatible(left: Ticket, right: Ticket) -> bool:
    if left.user_id == right.user_id:
        return False
    if right.user_id in left.blocked or left.user_id in right.blocked:
        return False
    if left.want_language != "any" and right.language != left.want_language:
        return False
    if right.want_language != "any" and left.language != right.want_language:
        return False
    if left.want_gender != "any" and right.gender != left.want_gender:
        return False
    if right.want_gender != "any" and left.gender != right.want_gender:
        return False
    return True


def _affinity(left: Ticket, right: Ticket) -> int:
    score = 0
    if left.language == right.language:
        score += 3
    shared = set(left.interests) & set(right.interests)
    score += min(len(shared), 5) * 2
    waited = int(time.time() - right.joined_at)
    score += min(waited // 10, 6)
    return score


async def enqueue(ticket: Ticket) -> None:
    ticket.joined_at = time.time()
    client = get_redis()
    pipeline = client.pipeline()
    pipeline.zadd(QUEUE_KEY.format(mode=ticket.mode), {str(ticket.user_id): ticket.joined_at})
    pipeline.set(
        META_KEY.format(mode=ticket.mode, user_id=ticket.user_id), ticket.to_json(), ex=META_TTL
    )
    await pipeline.execute()


async def dequeue(user_id: int, mode: str) -> None:
    client = get_redis()
    pipeline = client.pipeline()
    pipeline.zrem(QUEUE_KEY.format(mode=mode), str(user_id))
    pipeline.delete(META_KEY.format(mode=mode, user_id=user_id))
    await pipeline.execute()


async def dequeue_all(user_id: int) -> None:
    for mode in ("voice", "text"):
        await dequeue(user_id, mode)


async def queue_size(mode: str) -> int:
    return int(await get_redis().zcard(QUEUE_KEY.format(mode=mode)))


async def position(user_id: int, mode: str) -> int:
    rank = await get_redis().zrank(QUEUE_KEY.format(mode=mode), str(user_id))
    return int(rank) + 1 if rank is not None else 0


async def _acquire_lock(mode: str) -> str | None:
    token = uuid.uuid4().hex
    acquired = await get_redis().set(LOCK_KEY.format(mode=mode), token, nx=True, px=4000)
    return token if acquired else None


async def _release_lock(mode: str, token: str) -> None:
    client = get_redis()
    key = LOCK_KEY.format(mode=mode)
    current = await client.get(key)
    if current == token:
        await client.delete(key)


async def find_partner(ticket: Ticket, allow_recent: bool = False) -> Ticket | None:
    token = await _acquire_lock(ticket.mode)
    if token is None:
        return None
    client = get_redis()
    queue = QUEUE_KEY.format(mode=ticket.mode)
    try:
        candidates = await client.zrange(queue, 0, SCAN_LIMIT - 1)
        best: Ticket | None = None
        best_score = -1
        for raw_id in candidates:
            candidate_id = int(raw_id)
            if candidate_id == ticket.user_id:
                continue
            meta = await client.get(META_KEY.format(mode=ticket.mode, user_id=candidate_id))
            if meta is None:
                await client.zrem(queue, raw_id)
                continue
            candidate = Ticket.from_json(meta)
            if not _compatible(ticket, candidate):
                continue
            if not allow_recent and await client.exists(_recent_key(ticket.user_id, candidate_id)):
                continue
            score = _affinity(ticket, candidate)
            if score > best_score:
                best, best_score = candidate, score

        if best is None:
            return None

        pipeline = client.pipeline()
        pipeline.zrem(queue, str(best.user_id), str(ticket.user_id))
        pipeline.delete(
            META_KEY.format(mode=ticket.mode, user_id=best.user_id),
            META_KEY.format(mode=ticket.mode, user_id=ticket.user_id),
        )
        pipeline.set(_recent_key(ticket.user_id, best.user_id), "1", ex=RECENT_TTL)
        await pipeline.execute()
        return best
    finally:
        await _release_lock(ticket.mode, token)
