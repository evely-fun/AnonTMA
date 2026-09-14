import random
import re
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

ROUND_SECONDS = 60
BREAK_SECONDS = 12
MAX_SKIPS = 3
# Four rounds, and the pair explains in turn, so each half of a pair explains
# twice and guesses twice over a game.
TOTAL_ROUNDS = 4


def _pairs(players: list[int]) -> list[list[int]]:
    """Two to a pair. An odd player joins the last pair rather than sitting
    the game out, and that trio simply rotates who explains."""
    pool = list(players)
    random.shuffle(pool)
    made = [pool[index : index + 2] for index in range(0, len(pool) - 1, 2)]
    if len(pool) % 2 and made:
        made[-1].append(pool[-1])
    elif len(pool) % 2:
        made = [pool]
    return made

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
        min_players=4,
        max_players=12,
        voice_required=True,
        duration_minutes=12,
        tags=["voice", "pairs", "words"],
        rules=[
            "Players are paired, one explains and the other guesses",
            "Four rounds, and the pair swaps roles between them",
            "A word you skip costs your pair a point",
            "The pair with the most words at the end of the fourth round wins",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        pairs = _pairs(list(players))
        language = options.get("language", "en")
        deck = list(WORDS_RU if str(language).startswith(("ru", "uk")) else WORDS_EN)
        random.shuffle(deck)
        return {
            "phase": "lobby",
            "players": list(players),
            "pairs": pairs,
            "language": language,
            "deck": deck,
            "cursor": 0,
            "word": "",
            "round": 1,
            "totalRounds": int(options.get("rounds", TOTAL_ROUNDS)),
            "pairIndex": 0,
            "explainer": None,
            "scores": {str(index): 0 for index in range(len(pairs))},
            "personal": {str(player): 0 for player in players},
            "skips": 0,
            "violations": [],
            "roundLog": [],
            "winner": None,
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
        pairs = state["pairs"]
        if not pairs:
            return self._finish(state)
        if state["pairIndex"] >= len(pairs):
            state["pairIndex"] = 0
            state["round"] += 1
        if state["round"] > state["totalRounds"]:
            return self._finish(state)

        pair = pairs[state["pairIndex"]]
        # The pair swaps roles from one round to the next, so over four rounds
        # each half of it explains twice and guesses twice.
        explainer = pair[(state["round"] - 1) % len(pair)]
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
                        "pair": state["pairIndex"],
                        "round": state["round"],
                        "explainer": explainer,
                        "seconds": ROUND_SECONDS,
                        "scores": state["scores"],
                    },
                }
            ),
        ]

    def _pair_of(self, state: dict[str, Any], user_id: int) -> int | None:
        for index, pair in enumerate(state["pairs"]):
            if user_id in pair:
                return index
        return None

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if state["phase"] != "playing":
            return []
        explainer = state["explainer"]
        pair_index = state["pairIndex"]
        team = str(pair_index)
        team_members = state["pairs"][pair_index] if pair_index < len(state["pairs"]) else []

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
            # A skipped word costs the pair a point, so passing is a real
            # decision rather than a free reroll.
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
        winner = max(state["scores"], key=lambda key: state["scores"][key]) if state["scores"] else None
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
            state["pairIndex"] += 1
            return self._begin_turn(state)
        return []

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        pair_index = self._pair_of(state, user_id)
        is_explainer = state["explainer"] == user_id
        playing = state["pairIndex"] if state["pairIndex"] < len(state["pairs"]) else 0
        return {
            "phase": state["phase"],
            "pairs": state["pairs"],
            "yourPair": pair_index,
            "playingPair": playing,
            "yourTurn": pair_index == playing,
            "round": state["round"],
            "totalRounds": state["totalRounds"],
            "explainer": state["explainer"],
            "youExplain": is_explainer,
            "word": state["word"] if is_explainer and state["phase"] == "playing" else None,
            "scores": state["scores"],
            "personal": state["personal"],
            "skips": state["skips"],
            "maxSkips": MAX_SKIPS,
            "roundLog": state["roundLog"],
            "winner": state.get("winner"),
            "secondsLeft": remaining(state),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        winner = state.get("winner")
        output: dict[int, dict[str, Any]] = {}
        for player in state["players"]:
            index = self._pair_of(state, player)
            key = str(index) if index is not None else ""
            personal = state["personal"].get(str(player), 0)
            won = winner is not None and key == winner
            output[player] = {
                "score": personal * 10 + state["scores"].get(key, 0) * 5,
                "won": won,
                "placement": 1 if won else 2,
            }
        return output
