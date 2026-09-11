import asyncio
from collections import defaultdict
from typing import Any

import orjson
from fastapi import WebSocket

from app.core.logging import get_logger
from app.core.redis_client import get_redis
from app.realtime.protocol import encode

logger = get_logger("hub")

USER_CHANNEL = "rt:user:{user_id}"
TOPIC_CHANNEL = "rt:topic:{topic}"
PATTERN = "rt:*"


class Connection:
    __slots__ = ("id", "user_id", "socket", "topics", "closed", "lock")

    def __init__(self, connection_id: str, user_id: int, socket: WebSocket) -> None:
        self.id = connection_id
        self.user_id = user_id
        self.socket = socket
        self.topics: set[str] = set()
        self.closed = False
        self.lock = asyncio.Lock()

    async def send(self, message: dict[str, Any]) -> None:
        if self.closed:
            return
        try:
            async with self.lock:
                await self.socket.send_text(encode(message))
        except Exception:
            self.closed = True


class Hub:
    def __init__(self) -> None:
        self._by_user: dict[int, set[Connection]] = defaultdict(set)
        self._by_topic: dict[str, set[Connection]] = defaultdict(set)
        self._listener: asyncio.Task | None = None
        self._ready = asyncio.Event()

    async def start(self) -> None:
        if self._listener is None or self._listener.done():
            self._listener = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        if self._listener is not None:
            self._listener.cancel()
            self._listener = None

    async def _listen(self) -> None:
        while True:
            try:
                pubsub = get_redis().pubsub(ignore_subscribe_messages=True)
                await pubsub.psubscribe(PATTERN)
                self._ready.set()
                async for raw in pubsub.listen():
                    if raw is None or raw.get("type") != "pmessage":
                        continue
                    await self._dispatch(raw["channel"], raw["data"])
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._ready.clear()
                logger.warning("hub listener restart", error=str(exc))
                await asyncio.sleep(2)

    async def _dispatch(self, channel: str, data: str) -> None:
        try:
            frame = orjson.loads(data)
        except orjson.JSONDecodeError:
            return
        message = frame.get("message", {})
        exclude = frame.get("exclude")

        if channel.startswith("rt:user:"):
            user_id = int(channel.rsplit(":", 1)[1])
            targets = list(self._by_user.get(user_id, ()))
        elif channel.startswith("rt:topic:"):
            topic = channel.split("rt:topic:", 1)[1]
            targets = list(self._by_topic.get(topic, ()))
        else:
            return

        for connection in targets:
            if exclude and connection.id == exclude:
                continue
            await connection.send(message)

    def register(self, connection: Connection) -> None:
        self._by_user[connection.user_id].add(connection)

    def unregister(self, connection: Connection) -> None:
        self._by_user.get(connection.user_id, set()).discard(connection)
        if not self._by_user.get(connection.user_id):
            self._by_user.pop(connection.user_id, None)
        for topic in list(connection.topics):
            self.leave(connection, topic)

    def join(self, connection: Connection, topic: str) -> None:
        self._by_topic[topic].add(connection)
        connection.topics.add(topic)

    def leave(self, connection: Connection, topic: str) -> None:
        self._by_topic.get(topic, set()).discard(connection)
        if not self._by_topic.get(topic):
            self._by_topic.pop(topic, None)
        connection.topics.discard(topic)

    def local_user_connections(self, user_id: int) -> list[Connection]:
        return list(self._by_user.get(user_id, ()))

    def topic_members(self, topic: str) -> list[Connection]:
        return list(self._by_topic.get(topic, ()))

    async def _publish(self, channel: str, message: dict, exclude: str | None) -> bool:
        payload = orjson.dumps({"message": message, "exclude": exclude})
        try:
            await get_redis().publish(channel, payload)
            return True
        except Exception:
            return False

    async def send_to_user(self, user_id: int, message: dict) -> None:
        delivered = await self._publish(USER_CHANNEL.format(user_id=user_id), message, None)
        if not delivered or not self._ready.is_set():
            for connection in self.local_user_connections(user_id):
                await connection.send(message)

    async def send_to_users(self, user_ids: list[int], message: dict) -> None:
        for user_id in set(user_ids):
            await self.send_to_user(user_id, message)

    async def broadcast(self, topic: str, message: dict, exclude: str | None = None) -> None:
        delivered = await self._publish(TOPIC_CHANNEL.format(topic=topic), message, exclude)
        if not delivered or not self._ready.is_set():
            for connection in self.topic_members(topic):
                if exclude and connection.id == exclude:
                    continue
                await connection.send(message)


hub = Hub()
