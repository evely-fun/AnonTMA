import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Effect:
    event: dict
    target: str = "all"
    user_id: int | None = None


@dataclass(slots=True)
class GameMeta:
    key: str
    title: str
    subtitle: str
    icon: str
    accent: str
    min_players: int
    max_players: int
    voice_required: bool
    duration_minutes: int
    tags: list[str] = field(default_factory=list)
    rules: list[str] = field(default_factory=list)


class GameEngine(ABC):
    meta: GameMeta

    @abstractmethod
    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]: ...

    @abstractmethod
    def start(self, state: dict[str, Any]) -> list[Effect]: ...

    @abstractmethod
    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]: ...

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        return []

    @abstractmethod
    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]: ...

    def finished(self, state: dict[str, Any]) -> bool:
        return state.get("phase") == "finished"

    @abstractmethod
    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]: ...

    def leave(self, state: dict[str, Any], user_id: int) -> list[Effect]:
        players = state.get("players", [])
        if user_id in players:
            players.remove(user_id)
            state.setdefault("left", []).append(user_id)
        if len(players) < self.meta.min_players and state.get("phase") not in (
            "lobby",
            "finished",
        ):
            state["phase"] = "finished"
            state["reason"] = "not_enough_players"
            return [Effect(event={"type": "game.aborted", "payload": {"reason": "players_left"}})]
        return []


def now_ts() -> float:
    return time.time()


def deadline(seconds: int) -> float:
    return time.time() + seconds


def remaining(state: dict[str, Any]) -> int:
    value = state.get("deadline")
    if not value:
        return 0
    return max(0, int(value - time.time()))
