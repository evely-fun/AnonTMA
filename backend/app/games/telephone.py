import difflib
import random
import re
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

SPEAK_SECONDS = 15
WRITE_SECONDS = 25
REVEAL_SECONDS = 20

PHRASES_EN = [
    "A purple octopus is baking pancakes on the roof",
    "Seven sleepy turtles raced a paper airplane",
    "The lighthouse keeper collects thunderstorms in jars",
    "My neighbour taught his cactus to play the trumpet",
    "Nine penguins opened a laundromat in the desert",
    "A robot barista spilled coffee on the moon",
    "The postman delivers dreams every second Tuesday",
    "Grandma hid a spaceship behind the garden shed",
    "Two foxes argued about the price of clouds",
    "The library cat reviews horror novels at midnight",
    "A tiny dragon started a bakery near the river",
    "The mountain sneezed and dropped a rainbow",
]
PHRASES_RU = [
    "Фиолетовый осьминог печёт блины на крыше",
    "Семь сонных черепах обогнали бумажный самолёт",
    "Смотритель маяка собирает грозы в банки",
    "Сосед научил свой кактус играть на трубе",
    "Девять пингвинов открыли прачечную в пустыне",
    "Робот-бариста разлил кофе на Луне",
    "Почтальон разносит сны каждый второй вторник",
    "Бабушка спрятала космолёт за сараем",
    "Две лисы спорили о цене облаков",
    "Библиотечный кот рецензирует ужасы в полночь",
    "Маленький дракон открыл пекарню у реки",
    "Гора чихнула и уронила радугу",
]


def normalize(value: str) -> str:
    return re.sub(r"[^\w\s]", "", value.lower(), flags=re.UNICODE).strip()


def similarity(left: str, right: str) -> int:
    ratio = difflib.SequenceMatcher(None, normalize(left), normalize(right)).ratio()
    return int(round(ratio * 100))


class BrokenTelephone(GameEngine):
    meta = GameMeta(
        key="telephone",
        title="Broken Telephone",
        subtitle="Whisper a phrase down the chain and watch it melt",
        icon="📞",
        accent="#F2A33C",
        min_players=3,
        max_players=10,
        voice_required=True,
        duration_minutes=10,
        tags=["voice", "party", "funny"],
        rules=[
            "Only the current pair hears each other",
            "You get 15 seconds to whisper what you heard",
            "Accuracy of the chain decides the score",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        chain = list(players)
        random.shuffle(chain)
        return {
            "phase": "lobby",
            "players": list(players),
            "chain": chain,
            "language": options.get("language", "en"),
            "round": 0,
            "rounds": int(options.get("rounds", 2)),
            "step": 0,
            "original": "",
            "current": "",
            "history": [],
            "totals": {str(player): 0 for player in players},
            "deadline": None,
        }

    def _deck(self, state: dict[str, Any]) -> list[str]:
        language = str(state.get("language", "en"))
        return PHRASES_RU if language.startswith(("ru", "uk")) else PHRASES_EN

    def start(self, state: dict[str, Any]) -> list[Effect]:
        return self._begin_round(state)

    def _begin_round(self, state: dict[str, Any]) -> list[Effect]:
        state["round"] += 1
        state["step"] = 0
        state["history"] = []
        chain = state["chain"]
        chain.append(chain.pop(0))
        phrase = random.choice(self._deck(state))
        state["original"] = phrase
        state["current"] = phrase
        state["phase"] = "speak"
        state["deadline"] = deadline(SPEAK_SECONDS)

        speaker, listener = chain[0], chain[1]
        return [
            Effect(
                event={"type": "telephone.phrase", "payload": {"phrase": phrase, "round": state["round"]}},
                target="user",
                user_id=speaker,
            ),
            Effect(
                event={
                    "type": "telephone.turn",
                    "payload": {
                        "round": state["round"],
                        "step": 0,
                        "speaker": speaker,
                        "listener": listener,
                        "phase": "speak",
                    },
                }
            ),
        ]

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        chain = state["chain"]
        step = state["step"]
        if step + 1 >= len(chain):
            return []
        speaker, listener = chain[step], chain[step + 1]

        if action == "done_speaking" and state["phase"] == "speak" and user_id == speaker:
            return self._open_write(state, listener)

        if action == "submit" and state["phase"] == "write" and user_id == listener:
            heard = str(payload.get("text", ""))[:160].strip()
            return self._record(state, heard)

        return []

    def _open_write(self, state: dict[str, Any], listener: int) -> list[Effect]:
        state["phase"] = "write"
        state["deadline"] = deadline(WRITE_SECONDS)
        return [
            Effect(
                event={
                    "type": "telephone.turn",
                    "payload": {
                        "round": state["round"],
                        "step": state["step"],
                        "speaker": state["chain"][state["step"]],
                        "listener": listener,
                        "phase": "write",
                    },
                }
            )
        ]

    def _record(self, state: dict[str, Any], heard: str) -> list[Effect]:
        chain = state["chain"]
        step = state["step"]
        speaker, listener = chain[step], chain[step + 1]
        accuracy = similarity(state["current"], heard) if heard else 0

        state["history"].append(
            {
                "step": step,
                "from": speaker,
                "to": listener,
                "said": state["current"],
                "heard": heard or "…",
                "accuracy": accuracy,
            }
        )
        state["totals"][str(listener)] = state["totals"].get(str(listener), 0) + accuracy
        state["current"] = heard or state["current"]
        state["step"] += 1

        if state["step"] + 1 >= len(chain):
            return self._reveal(state)

        state["phase"] = "speak"
        state["deadline"] = deadline(SPEAK_SECONDS)
        next_speaker, next_listener = chain[state["step"]], chain[state["step"] + 1]
        return [
            Effect(
                event={"type": "telephone.phrase", "payload": {"phrase": state["current"], "round": state["round"]}},
                target="user",
                user_id=next_speaker,
            ),
            Effect(
                event={
                    "type": "telephone.turn",
                    "payload": {
                        "round": state["round"],
                        "step": state["step"],
                        "speaker": next_speaker,
                        "listener": next_listener,
                        "phase": "speak",
                    },
                }
            ),
        ]

    def _reveal(self, state: dict[str, Any]) -> list[Effect]:
        final_accuracy = similarity(state["original"], state["current"])
        state["phase"] = "reveal"
        state["deadline"] = deadline(REVEAL_SECONDS)
        return [
            Effect(
                event={
                    "type": "telephone.reveal",
                    "payload": {
                        "original": state["original"],
                        "final": state["current"],
                        "accuracy": final_accuracy,
                        "history": state["history"],
                        "totals": state["totals"],
                        "round": state["round"],
                    },
                }
            )
        ]

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        phase = state["phase"]
        chain = state["chain"]

        if phase == "speak":
            return self._open_write(state, chain[state["step"] + 1])
        if phase == "write":
            return self._record(state, "")
        if phase == "reveal":
            if state["round"] >= state["rounds"]:
                state["phase"] = "finished"
                state["deadline"] = None
                return [
                    Effect(
                        event={"type": "game.finished", "payload": {"totals": state["totals"]}}
                    )
                ]
            return self._begin_round(state)
        return []

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        chain = state["chain"]
        step = state["step"]
        speaker = chain[step] if step < len(chain) else None
        listener = chain[step + 1] if step + 1 < len(chain) else None
        return {
            "phase": state["phase"],
            "round": state["round"],
            "rounds": state["rounds"],
            "step": step,
            "chain": chain,
            "speaker": speaker,
            "listener": listener,
            "youSpeak": user_id == speaker,
            "youListen": user_id == listener,
            "audioRoute": [speaker, listener] if state["phase"] in ("speak", "write") else [],
            "totals": state["totals"],
            "reveal": (
                {
                    "original": state["original"],
                    "final": state["current"],
                    "history": state["history"],
                }
                if state["phase"] in ("reveal", "finished")
                else None
            ),
            "secondsLeft": remaining(state),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        ranking = sorted(
            ((int(key), value) for key, value in state["totals"].items()),
            key=lambda item: item[1],
            reverse=True,
        )
        best = ranking[0][1] if ranking else 0
        return {
            player: {"score": total, "won": total == best and best > 0, "placement": index}
            for index, (player, total) in enumerate(ranking, start=1)
        }
