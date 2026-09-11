import random
import time
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

COUNTDOWN_SECONDS = 4
MAX_RUN_SECONDS = 180
MAX_SCORE_PER_SECOND = 1.2


class VoiceFlappy(GameEngine):
    meta = GameMeta(
        key="flappy",
        title="Voice Flappy",
        subtitle="Your voice is the only control, hum to fly",
        icon="🐤",
        accent="#FFC94A",
        min_players=1,
        max_players=6,
        voice_required=True,
        duration_minutes=4,
        tags=["voice", "arcade", "race"],
        rules=[
            "Loud voice lifts the bird, silence drops it",
            "Everyone flies through the same pipes",
            "Last bird alive takes the crown",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        return {
            "phase": "lobby",
            "players": list(players),
            "seed": random.randint(100000, 999999),
            "difficulty": str(options.get("difficulty", "normal")),
            "alive": list(players),
            "scores": {str(player): 0 for player in players},
            "altitudes": {str(player): 0.5 for player in players},
            "bestScore": 0,
            "startedAt": None,
            "deadline": None,
        }

    def start(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "countdown"
        state["deadline"] = deadline(COUNTDOWN_SECONDS)
        return [
            Effect(
                event={
                    "type": "flappy.countdown",
                    "payload": {"seconds": COUNTDOWN_SECONDS, "seed": state["seed"], "difficulty": state["difficulty"]},
                }
            )
        ]

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if state["phase"] != "running":
            return []
        key = str(user_id)

        if action == "progress" and user_id in state["alive"]:
            elapsed = max(1.0, time.time() - float(state["startedAt"] or time.time()))
            reported = int(payload.get("score", 0))
            ceiling = int(elapsed * MAX_SCORE_PER_SECOND) + 2
            score = max(state["scores"].get(key, 0), min(reported, ceiling))
            state["scores"][key] = score
            state["altitudes"][key] = max(0.0, min(1.0, float(payload.get("altitude", 0.5))))
            state["bestScore"] = max(state["bestScore"], score)
            return [
                Effect(
                    event={
                        "type": "flappy.progress",
                        "payload": {"user": user_id, "score": score, "altitude": state["altitudes"][key]},
                    }
                )
            ]

        if action == "crash" and user_id in state["alive"]:
            state["alive"].remove(user_id)
            effects = [
                Effect(
                    event={
                        "type": "flappy.crash",
                        "payload": {"user": user_id, "score": state["scores"].get(key, 0), "alive": state["alive"]},
                    }
                )
            ]
            if not state["alive"]:
                effects += self._finish(state)
            return effects

        return []

    def _finish(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "finished"
        state["deadline"] = None
        ranking = sorted(state["scores"].items(), key=lambda item: item[1], reverse=True)
        state["winner"] = int(ranking[0][0]) if ranking and ranking[0][1] > 0 else None
        return [
            Effect(
                event={
                    "type": "game.finished",
                    "payload": {"scores": state["scores"], "winner": state.get("winner")},
                }
            )
        ]

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        if state["phase"] == "countdown":
            state["phase"] = "running"
            state["startedAt"] = time.time()
            state["deadline"] = deadline(MAX_RUN_SECONDS)
            return [Effect(event={"type": "flappy.go", "payload": {"seed": state["seed"]}})]
        if state["phase"] == "running":
            return self._finish(state)
        return []

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        return {
            "phase": state["phase"],
            "seed": state["seed"],
            "difficulty": state["difficulty"],
            "players": state["players"],
            "alive": state["alive"],
            "scores": state["scores"],
            "altitudes": state["altitudes"],
            "youAlive": user_id in state["alive"],
            "yourScore": state["scores"].get(str(user_id), 0),
            "winner": state.get("winner"),
            "secondsLeft": remaining(state),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        ranking = sorted(
            ((int(key), value) for key, value in state["scores"].items()),
            key=lambda item: item[1],
            reverse=True,
        )
        return {
            player: {
                "score": score,
                "won": state.get("winner") == player,
                "placement": index,
            }
            for index, (player, score) in enumerate(ranking, start=1)
        }
