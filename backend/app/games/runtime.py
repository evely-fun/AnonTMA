import asyncio
import time
import uuid
from typing import Any

import orjson

from app.core.logging import get_logger
from app.core.redis_client import get_redis
from app.db.base import utcnow
from app.db.models import GameResult, GameSession, GameStatus, User, UserStats
from app.db.session import SessionLocal
from app.games.base import Effect
from app.games.registry import get_engine
from app.realtime.hub import hub
from app.services import economy
from app.services.progression import game_reward
from app.services.users import award

logger = get_logger("games")

STATE_KEY = "game:{game_id}"
LOCK_KEY = "game:lock:{game_id}"
ACTIVE_KEY = "games:active"
STATE_TTL = 60 * 60 * 4


def topic(game_id: int) -> str:
    return f"game:{game_id}"


async def _load(game_id: int) -> tuple[str, dict] | None:
    raw = await get_redis().get(STATE_KEY.format(game_id=game_id))
    if not raw:
        return None
    frame = orjson.loads(raw)
    return frame["key"], frame["state"]


async def _save(game_id: int, game_key: str, state: dict) -> None:
    await get_redis().set(
        STATE_KEY.format(game_id=game_id),
        orjson.dumps({"key": game_key, "state": state}),
        ex=STATE_TTL,
    )


async def _lock(game_id: int) -> str | None:
    token = uuid.uuid4().hex
    acquired = await get_redis().set(LOCK_KEY.format(game_id=game_id), token, nx=True, px=5000)
    return token if acquired else None


async def _unlock(game_id: int, token: str) -> None:
    client = get_redis()
    key = LOCK_KEY.format(game_id=game_id)
    if await client.get(key) == token:
        await client.delete(key)


async def _emit(game_id: int, game_key: str, state: dict, effects: list[Effect]) -> None:
    engine = get_engine(game_key)
    if engine is None:
        return
    for effect in effects:
        if effect.target == "user" and effect.user_id:
            await hub.send_to_user(effect.user_id, effect.event)
        else:
            await hub.broadcast(topic(game_id), effect.event)
    for player in state.get("players", []):
        await hub.send_to_user(
            player,
            {
                "type": "game.state",
                "payload": {
                    "gameId": game_id,
                    "gameKey": game_key,
                    "view": engine.player_view(state, player),
                },
            },
        )


async def create_game(
    game_key: str, host_id: int, players: list[int], room_id: int | None, options: dict[str, Any]
) -> dict | None:
    engine = get_engine(game_key)
    if engine is None:
        return None
    unique_players = list(dict.fromkeys(players))
    if not (engine.meta.min_players <= len(unique_players) <= engine.meta.max_players):
        if not (game_key == "tictactoe" and len(unique_players) == 1):
            return None

    settings = dict(options or {})
    # Whoever opened the table runs it, which is what a game with a host reads.
    settings.setdefault("host", host_id)
    state = engine.create(unique_players, settings)
    async with SessionLocal() as session:
        record = GameSession(
            game_key=game_key,
            room_id=room_id,
            host_id=host_id,
            status=GameStatus.lobby,
            state={},
            started_at=utcnow(),
        )
        session.add(record)
        await session.commit()
        game_id = record.id

    await _save(game_id, game_key, state)
    await get_redis().zadd(ACTIVE_KEY, {str(game_id): time.time()})
    return {"gameId": game_id, "gameKey": game_key, "players": unique_players}


async def push_state(game_id: int) -> None:
    loaded = await _load(game_id)
    if loaded is None:
        return
    game_key, state = loaded
    await _emit(game_id, game_key, state, [])


async def start_game(game_id: int) -> bool:
    token = await _lock(game_id)
    if token is None:
        return False
    try:
        loaded = await _load(game_id)
        if loaded is None:
            return False
        game_key, state = loaded
        engine = get_engine(game_key)
        if engine is None or state.get("phase") != "lobby":
            return False
        effects = engine.start(state)
        await _save(game_id, game_key, state)
        async with SessionLocal() as session:
            record = await session.get(GameSession, game_id)
            if record:
                record.status = GameStatus.running
                await session.commit()
        await _emit(game_id, game_key, state, effects)
        return True
    finally:
        await _unlock(game_id, token)


async def handle_action(game_id: int, user_id: int, action: str, payload: dict) -> None:
    token = await _lock(game_id)
    if token is None:
        await asyncio.sleep(0.05)
        token = await _lock(game_id)
        if token is None:
            return
    try:
        loaded = await _load(game_id)
        if loaded is None:
            return
        game_key, state = loaded
        engine = get_engine(game_key)
        if engine is None or user_id not in state.get("players", []):
            return
        effects = engine.action(state, user_id, action, payload or {})
        await _save(game_id, game_key, state)
        await _emit(game_id, game_key, state, effects)
        if engine.finished(state):
            await finalize(game_id, game_key, state)
    finally:
        await _unlock(game_id, token)


async def handle_leave(game_id: int, user_id: int) -> None:
    token = await _lock(game_id)
    if token is None:
        return
    try:
        loaded = await _load(game_id)
        if loaded is None:
            return
        game_key, state = loaded
        engine = get_engine(game_key)
        if engine is None:
            return
        effects = engine.leave(state, user_id)
        await _save(game_id, game_key, state)
        await _emit(game_id, game_key, state, effects)
        if engine.finished(state):
            await finalize(game_id, game_key, state)
    finally:
        await _unlock(game_id, token)


async def snapshot(game_id: int, user_id: int) -> dict | None:
    loaded = await _load(game_id)
    if loaded is None:
        return None
    game_key, state = loaded
    engine = get_engine(game_key)
    if engine is None:
        return None
    return {"gameId": game_id, "gameKey": game_key, "view": engine.player_view(state, user_id)}


async def finalize(game_id: int, game_key: str, state: dict) -> None:
    client = get_redis()
    if not await client.zscore(ACTIVE_KEY, str(game_id)):
        return
    await client.zrem(ACTIVE_KEY, str(game_id))

    engine = get_engine(game_key)
    if engine is None:
        return
    results = engine.scores(state)

    async with SessionLocal() as session:
        record = await session.get(GameSession, game_id)
        if record:
            record.status = GameStatus.finished
            record.finished_at = utcnow()
            record.state = state

        rewards: dict[int, dict] = {}
        players = len(results) or 1
        for user_id, outcome in results.items():
            xp, coins = game_reward(
                bool(outcome.get("won")), int(outcome.get("placement", 0)), players, int(outcome.get("score", 0))
            )
            stats = await session.get(UserStats, user_id)
            energy_gain = 0
            if stats:
                stats.games_played += 1
                if outcome.get("won"):
                    stats.games_won += 1
                owner = await session.get(User, user_id)
                premium = economy.is_premium(owner) if owner else False
                economy.regenerate(stats, premium)
                energy_gain = economy.add_energy(
                    stats,
                    premium,
                    economy.ENERGY_GAME_REWARD
                    + (economy.ENERGY_GAME_WIN_BONUS if outcome.get("won") else 0),
                )
            session.add(
                GameResult(
                    session_id=game_id,
                    game_key=game_key,
                    user_id=user_id,
                    score=int(outcome.get("score", 0)),
                    placement=int(outcome.get("placement", 0)),
                    won=bool(outcome.get("won")),
                    xp_awarded=xp,
                    coins_awarded=coins,
                    created_at=utcnow(),
                )
            )
            rewards[user_id] = {
                **await award(session, user_id, xp=xp, coins=coins),
                "energy": energy_gain,
            }
        await session.commit()

    for user_id, reward in rewards.items():
        await hub.send_to_user(
            user_id,
            {
                "type": "game.rewards",
                "payload": {"gameId": game_id, "gameKey": game_key, "reward": reward, "result": results.get(user_id, {})},
            },
        )


async def ticker() -> None:
    while True:
        try:
            client = get_redis()
            active = await client.zrange(ACTIVE_KEY, 0, 200)
            now = time.time()
            for raw_id in active:
                game_id = int(raw_id)
                loaded = await _load(game_id)
                if loaded is None:
                    await client.zrem(ACTIVE_KEY, raw_id)
                    continue
                game_key, state = loaded
                engine = get_engine(game_key)
                if engine is None:
                    await client.zrem(ACTIVE_KEY, raw_id)
                    continue
                if not state.get("deadline") or now < float(state["deadline"]):
                    continue
                token = await _lock(game_id)
                if token is None:
                    continue
                try:
                    loaded = await _load(game_id)
                    if loaded is None:
                        continue
                    game_key, state = loaded
                    effects = engine.tick(state, now)
                    if effects:
                        await _save(game_id, game_key, state)
                        await _emit(game_id, game_key, state, effects)
                    if engine.finished(state):
                        await finalize(game_id, game_key, state)
                finally:
                    await _unlock(game_id, token)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("game ticker error", error=str(exc))
        await asyncio.sleep(1)
