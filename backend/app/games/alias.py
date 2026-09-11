import random
import re
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

ROUND_SECONDS = 60
BREAK_SECONDS = 12
MAX_SKIPS = 3

WORDS_EN = [
    "lighthouse", "avalanche", "telescope", "pineapple", "submarine", "firework",
    "keyboard", "hurricane", "waterfall", "compass", "hedgehog", "pharaoh",
    "volcano", "sandcastle", "marathon", "parachute", "microscope", "carousel",
    "dinosaur", "gravity", "origami", "postcard", "bubblegum", "windmill",
    "treasure", "umbrella", "elevator", "scarecrow", "snowflake", "harmonica",
    "labyrinth", "campfire", "spaceship", "butterfly", "chandelier", "waffle",
]
WORDS_RU = [
    "маяк", "лавина", "телескоп", "ананас", "подводная лодка", "фейерверк",
    "клавиатура", "ураган", "водопад", "компас", "ёжик", "фараон",
    "вулкан", "песочный замок", "марафон", "парашют", "микроскоп", "карусель",
    "динозавр", "гравитация", "оригами", "открытка", "жвачка", "мельница",
    "сокровище", "зонтик", "лифт", "пугало", "снежинка", "губная гармошка",
    "лабиринт", "костёр", "космолёт", "бабочка", "люстра", "вафля",
]


def normalize(value: str) -> str:
    return re.sub(r"[^\w\s]", "", value.lower(), flags=re.UNICODE).strip()


def matches(guess: str, word: str) -> bool:
    left, right = normalize(guess), normalize(word)
    if not left or not right:
        return False
    if left == right:
        return True
    if len(right) >= 5 and left.startswith(right[: len(right) - 2]):
        return True
    return False


class Alias(GameEngine):
    meta = GameMeta(
        key="alias",
        title="Alias",
        subtitle="Explain the word with your voice, never say it",
        icon="🗣",
        accent="#3FBF8F",
        min_players=3,
        max_players=10,
        voice_required=True,
        duration_minutes=12,
        tags=["voice", "teams", "words"],
        rules=[
            "The explainer describes the word out loud",
            "Saying the word or its root costs a point",
            "Team mates type guesses, the fastest correct one scores",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        pool = list(players)
        random.shuffle(pool)
        teams = {"a": pool[::2], "b": pool[1::2]}
        language = options.get("language", "en")
        deck = list(WORDS_RU if str(language).startswith(("ru", "uk")) else WORDS_EN)
        random.shuffle(deck)
        return {
            "phase": "lobby",
            "players": list(players),
            "teams": teams,
            "language": language,
            "deck": deck,
            "cursor": 0,
            "word": "",
            "turn": "a",
            "explainerIndex": {"a": 0, "b": 0},
            "explainer": None,
            "scores": {"a": 0, "b": 0},
            "personal": {str(player): 0 for player in players},
            "skips": 0,
            "violations": [],
            "target": int(options.get("target", 20)),
            "roundLog": [],
            "deadline": None,
        }

    def start(self, state: dict[str, Any]) -> list[Effect]:
        return self._begin_turn(state)

    def _next_word(self, state: dict[str, Any]) -> str:
        if state["cursor"] >= len(state["deck"]):
            random.shuffle(state["deck"])
            state["cursor"] = 0
        word = state["deck"][state["cursor"]]
        state["cursor"] += 1
        state["word"] = word
        return word

    def _begin_turn(self, state: dict[str, Any]) -> list[Effect]:
        team = state["turn"]
        members = state["teams"][team]
        if not members:
            state["turn"] = "b" if team == "a" else "a"
            members = state["teams"][state["turn"]]
            team = state["turn"]
        if not members:
            state["phase"] = "finished"
            return [Effect(event={"type": "game.finished", "payload": {"scores": state["scores"]}})]

        index = state["explainerIndex"][team] % len(members)
        explainer = members[index]
        state["explainerIndex"][team] = index + 1
        state["explainer"] = explainer
        state["phase"] = "playing"
        state["skips"] = 0
        state["violations"] = []
        state["roundLog"] = []
        state["deadline"] = deadline(ROUND_SECONDS)
        word = self._next_word(state)

        return [
            Effect(
                event={"type": "alias.word", "payload": {"word": word}},
                target="user",
                user_id=explainer,
            ),
            Effect(
                event={
                    "type": "alias.turn",
                    "payload": {
                        "team": team,
                        "explainer": explainer,
                        "seconds": ROUND_SECONDS,
                        "scores": state["scores"],
                    },
                }
            ),
        ]

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if state["phase"] != "playing":
            return []
        explainer = state["explainer"]
        team = state["turn"]
        team_members = state["teams"][team]

        if action == "guess" and user_id != explainer:
            guess = str(payload.get("text", ""))[:60]
            correct = matches(guess, state["word"]) and user_id in team_members
            effects = [
                Effect(
                    event={
                        "type": "alias.guess",
                        "payload": {"by": user_id, "text": guess, "correct": correct},
                    }
                )
            ]
            if correct:
                state["scores"][team] += 1
                state["personal"][str(user_id)] = state["personal"].get(str(user_id), 0) + 1
                state["personal"][str(explainer)] = state["personal"].get(str(explainer), 0) + 1
                state["roundLog"].append({"word": state["word"], "by": user_id, "status": "guessed"})
                if state["scores"][team] >= state["target"]:
                    return effects + self._finish(state)
                word = self._next_word(state)
                effects.append(
                    Effect(
                        event={"type": "alias.word", "payload": {"word": word}},
                        target="user",
                        user_id=explainer,
                    )
                )
                effects.append(
                    Effect(event={"type": "alias.score", "payload": {"scores": state["scores"], "solved": True}})
                )
            return effects

        if action == "skip" and user_id == explainer:
            if state["skips"] >= MAX_SKIPS:
                return [
                    Effect(
                        event={"type": "game.rejected", "payload": {"reason": "no_skips_left"}},
                        target="user",
                        user_id=user_id,
                    )
                ]
            state["skips"] += 1
            state["scores"][team] = max(0, state["scores"][team] - 1)
            state["roundLog"].append({"word": state["word"], "status": "skipped"})
            word = self._next_word(state)
            return [
                Effect(
                    event={"type": "alias.word", "payload": {"word": word}},
                    target="user",
                    user_id=explainer,
                ),
                Effect(
                    event={
                        "type": "alias.score",
                        "payload": {"scores": state["scores"], "skipped": True, "skips": state["skips"]},
                    }
                ),
            ]

        if action == "violation" and user_id != explainer:
            if user_id in state["violations"]:
                return []
            state["violations"].append(user_id)
            if len(state["violations"]) > max(1, len(team_members) // 2):
                state["scores"][team] = max(0, state["scores"][team] - 1)
                state["violations"] = []
                state["roundLog"].append({"word": state["word"], "status": "violation"})
                word = self._next_word(state)
                return [
                    Effect(
                        event={"type": "alias.word", "payload": {"word": word}},
                        target="user",
                        user_id=explainer,
                    ),
                    Effect(
                        event={"type": "alias.score", "payload": {"scores": state["scores"], "violation": True}}
                    ),
                ]
            return [
                Effect(event={"type": "alias.violation", "payload": {"count": len(state["violations"])}})
            ]

        return []

    def _finish(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "finished"
        state["deadline"] = None
        winner = max(state["scores"], key=lambda key: state["scores"][key])
        state["winner"] = winner
        return [
            Effect(
                event={
                    "type": "game.finished",
                    "payload": {"winner": winner, "scores": state["scores"], "personal": state["personal"]},
                }
            )
        ]

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        if state["phase"] == "playing":
            state["phase"] = "break"
            state["deadline"] = deadline(BREAK_SECONDS)
            return [
                Effect(
                    event={
                        "type": "alias.round_over",
                        "payload": {"scores": state["scores"], "log": state["roundLog"]},
                    }
                )
            ]
        if state["phase"] == "break":
            if max(state["scores"].values()) >= state["target"]:
                return self._finish(state)
            state["turn"] = "b" if state["turn"] == "a" else "a"
            return self._begin_turn(state)
        return []

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        team = "a" if user_id in state["teams"]["a"] else "b"
        is_explainer = state["explainer"] == user_id
        return {
            "phase": state["phase"],
            "teams": state["teams"],
            "yourTeam": team,
            "turn": state["turn"],
            "explainer": state["explainer"],
            "youExplain": is_explainer,
            "word": state["word"] if is_explainer and state["phase"] == "playing" else None,
            "scores": state["scores"],
            "personal": state["personal"],
            "skips": state["skips"],
            "maxSkips": MAX_SKIPS,
            "target": state["target"],
            "roundLog": state["roundLog"],
            "winner": state.get("winner"),
            "secondsLeft": remaining(state),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        winner = state.get("winner")
        output: dict[int, dict[str, Any]] = {}
        for player in state["players"]:
            team = "a" if player in state["teams"]["a"] else "b"
            personal = state["personal"].get(str(player), 0)
            won = winner == team
            output[player] = {
                "score": personal * 10 + state["scores"][team] * 5,
                "won": won,
                "placement": 1 if won else 2,
            }
        return output
