"""Broken Telephone, played on paper rather than down a line.

Everyone starts a sheet with a situation written on it. The sheet moves one
seat, and whoever picks it up has to draw what it says. It moves again, and
the next person writes down what they think the drawing shows, having never
seen the words that made it. The gap between the first sentence and the last
one is the whole game, and the chains are shown side by side at the end.

Drawings travel as strokes rather than pictures: a list of points in a
thousand by thousand square. That keeps a sheet a few kilobytes instead of a
few hundred, and it redraws crisply at any size.
"""

import random
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

WRITE_SECONDS = 30
DRAW_SECONDS = 60
GALLERY_SECONDS = 45
VOTE_SECONDS = 30

# A chain longer than this stops being funny and starts being a queue.
MAX_STEPS = 6
MIN_STEPS = 3

# What one drawing may carry. Generous for a phone drawing, small enough that
# a full game stays well inside a normal state payload.
MAX_STROKES = 120
MAX_POINTS = 240
CANVAS = 1000

PROMPTS_EN = [
    "A purple octopus baking pancakes on the roof",
    "Seven sleepy turtles racing a paper aeroplane",
    "A lighthouse keeper collecting thunderstorms in jars",
    "A cactus being taught the trumpet",
    "Nine penguins opening a laundromat in the desert",
    "A robot barista spilling coffee on the moon",
    "A postman delivering dreams on a Tuesday",
    "A spaceship hidden behind the garden shed",
    "Two foxes arguing about the price of clouds",
    "The library cat reviewing horror novels at midnight",
]
PROMPTS_RU = [
    "Фиолетовый осьминог печёт блины на крыше",
    "Семь сонных черепах обгоняют бумажный самолёт",
    "Смотритель маяка собирает грозы в банки",
    "Кактус учат играть на трубе",
    "Девять пингвинов открывают прачечную в пустыне",
    "Робот-бариста разливает кофе на Луне",
    "Почтальон разносит сны по вторникам",
    "За сараем спрятан космолёт",
    "Две лисы спорят о цене облаков",
    "Библиотечный кот рецензирует ужасы в полночь",
]


def _clean_strokes(raw: Any) -> list[dict[str, Any]]:
    """Take only what a drawing is allowed to be, and clamp all of it."""
    if not isinstance(raw, list):
        return []
    strokes: list[dict[str, Any]] = []
    for entry in raw[:MAX_STROKES]:
        if not isinstance(entry, dict):
            continue
        points = entry.get("p")
        if not isinstance(points, list) or len(points) < 4:
            continue
        clamped = [
            max(0, min(CANVAS, int(value)))
            for value in points[: MAX_POINTS * 2]
            if isinstance(value, (int, float))
        ]
        if len(clamped) < 4:
            continue
        # Points come in pairs, so an odd tail is dropped rather than guessed.
        if len(clamped) % 2:
            clamped.pop()
        strokes.append(
            {
                "c": max(0, min(7, int(entry.get("c", 0) or 0))),
                "w": max(1, min(24, int(entry.get("w", 4) or 4))),
                "p": clamped,
            }
        )
    return strokes


class BrokenTelephone(GameEngine):
    meta = GameMeta(
        key="telephone",
        title="Broken Telephone",
        subtitle="Write it, draw it, guess it, and watch it fall apart",
        icon="✏️",
        accent="#E0514C",
        min_players=4,
        max_players=10,
        voice_required=False,
        duration_minutes=12,
        tags=["party", "drawing", "words"],
        rules=[
            "Everyone writes a situation, then the sheets start moving",
            "Draw what the sheet says, in sixty seconds",
            "The next person writes what the drawing shows, without the words",
            "The chains are laid out at the end and the table votes on the best",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        roster = list(players)
        random.shuffle(roster)
        language = str(options.get("language", "en"))
        prompts = PROMPTS_RU if language.startswith(("ru", "uk")) else PROMPTS_EN
        # Every sheet belongs to whoever started it, and each one keeps its own
        # suggestion so nobody stares at an empty box.
        sheets = [
            {"owner": player, "suggestion": prompt, "steps": []}
            for player, prompt in zip(roster, random.sample(prompts, len(roster)))
        ]
        return {
            "phase": "lobby",
            "players": list(players),
            "order": roster,
            "sheets": sheets,
            "step": 0,
            "steps": max(MIN_STEPS, min(MAX_STEPS, len(roster))),
            "submitted": [],
            "votes": {},
            "winner": None,
            "deadline": None,
        }

    # Whose hands a sheet is in on a given step.

    def _holder(self, state: dict[str, Any], sheet: int, step: int) -> int:
        order = state["order"]
        return order[(sheet + step) % len(order)]

    def _sheet_for(self, state: dict[str, Any], user_id: int) -> int | None:
        order = state["order"]
        if user_id not in order:
            return None
        seat = order.index(user_id)
        return (seat - state["step"]) % len(order)

    def _kind(self, step: int) -> str:
        """Odd steps are drawings, even ones are words, starting with words."""
        return "draw" if step % 2 else "write"

    def start(self, state: dict[str, Any]) -> list[Effect]:
        return self._open_step(state)

    def _open_step(self, state: dict[str, Any]) -> list[Effect]:
        if state["step"] >= state["steps"]:
            return self._open_gallery(state)
        kind = self._kind(state["step"])
        state["phase"] = kind
        state["submitted"] = []
        state["deadline"] = deadline(DRAW_SECONDS if kind == "draw" else WRITE_SECONDS)
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {"phase": kind, "step": state["step"], "of": state["steps"]},
                }
            )
        ]

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if action == "submit" and state["phase"] in ("write", "draw"):
            return self._submit(state, user_id, payload)
        if action == "vote" and state["phase"] == "vote":
            return self._vote(state, user_id, payload)
        return []

    def _submit(
        self, state: dict[str, Any], user_id: int, payload: dict[str, Any]
    ) -> list[Effect]:
        sheet = self._sheet_for(state, user_id)
        if sheet is None or user_id in state["submitted"]:
            return []

        kind = self._kind(state["step"])
        entry: dict[str, Any] = {"by": user_id, "kind": kind}
        if kind == "write":
            text = str(payload.get("text", "")).strip()[:120]
            if not text:
                return []
            entry["text"] = text
        else:
            strokes = _clean_strokes(payload.get("strokes"))
            if not strokes:
                return []
            entry["strokes"] = strokes

        state["sheets"][sheet]["steps"].append(entry)
        state["submitted"].append(user_id)

        effects = [
            Effect(
                event={
                    "type": "telephone.submitted",
                    "payload": {"count": len(state["submitted"]), "of": len(state["order"])},
                }
            )
        ]
        if len(state["submitted"]) >= len(state["order"]):
            state["step"] += 1
            effects += self._open_step(state)
        return effects

    def _open_gallery(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "gallery"
        state["deadline"] = deadline(GALLERY_SECONDS)
        return [
            Effect(
                event={
                    "type": "telephone.gallery",
                    "payload": {"sheets": state["sheets"]},
                }
            )
        ]

    def _open_vote(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "vote"
        state["votes"] = {}
        state["deadline"] = deadline(VOTE_SECONDS)
        return [
            Effect(event={"type": "game.phase", "payload": {"phase": "vote"}})
        ]

    def _vote(self, state: dict[str, Any], user_id: int, payload: dict[str, Any]) -> list[Effect]:
        sheet = int(payload.get("sheet", -1))
        if not 0 <= sheet < len(state["sheets"]):
            return []
        # You cannot vote for the chain you started.
        if state["sheets"][sheet]["owner"] == user_id:
            return []
        state["votes"][str(user_id)] = sheet
        effects = [
            Effect(
                event={
                    "type": "telephone.vote",
                    "payload": {"count": len(state["votes"]), "of": len(state["order"])},
                }
            )
        ]
        if len(state["votes"]) >= len(state["order"]) - 1:
            effects += self._finish(state)
        return effects

    def _finish(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "finished"
        state["deadline"] = None
        tally: dict[int, int] = {}
        for sheet in state["votes"].values():
            tally[sheet] = tally.get(sheet, 0) + 1
        state["winner"] = max(tally, key=lambda key: tally[key]) if tally else None
        return [
            Effect(
                event={
                    "type": "game.finished",
                    "payload": {
                        "winner": state["winner"],
                        "sheets": state["sheets"],
                        "tally": {str(key): value for key, value in tally.items()},
                    },
                }
            )
        ]

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        if state["phase"] in ("write", "draw"):
            # Whoever ran out of time simply contributed nothing to that sheet.
            state["step"] += 1
            return self._open_step(state)
        if state["phase"] == "gallery":
            return self._open_vote(state)
        if state["phase"] == "vote":
            return self._finish(state)
        return []

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        sheet_index = self._sheet_for(state, user_id)
        sheet = state["sheets"][sheet_index] if sheet_index is not None else None
        kind = self._kind(state["step"]) if state["step"] < state["steps"] else None

        # You only ever see the step immediately before yours, which is what
        # makes the chain break in the first place.
        previous: dict[str, Any] | None = None
        if sheet and sheet["steps"]:
            previous = sheet["steps"][-1]
        prompt = sheet["suggestion"] if sheet and not sheet["steps"] else None

        showing = state["phase"] in ("gallery", "vote", "finished")
        return {
            "phase": state["phase"],
            "step": state["step"],
            "steps": state["steps"],
            "kind": kind,
            "yourSheet": sheet_index,
            "prompt": prompt,
            "previous": previous if not showing else None,
            "submitted": user_id in state["submitted"],
            "waiting": len(state["order"]) - len(state["submitted"]),
            "sheets": state["sheets"] if showing else [],
            "owners": [item["owner"] for item in state["sheets"]],
            "votes": state["votes"] if showing else {},
            "voted": str(user_id) in state["votes"],
            "winner": state.get("winner"),
            "secondsLeft": remaining(state),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        tally: dict[int, int] = {}
        for sheet in state["votes"].values():
            tally[sheet] = tally.get(sheet, 0) + 1

        output: dict[int, dict[str, Any]] = {}
        for player in state["players"]:
            contributed = sum(
                1
                for sheet in state["sheets"]
                for step in sheet["steps"]
                if step["by"] == player
            )
            # A chain is a group effort, so everyone on the winning sheet is
            # paid, not only whoever started it.
            on_winner = (
                state["winner"] is not None
                and any(
                    step["by"] == player
                    for step in state["sheets"][state["winner"]]["steps"]
                )
            )
            output[player] = {
                "score": contributed * 12 + (40 if on_winner else 0),
                "won": on_winner,
                "placement": 1 if on_winner else 2,
            }
        return output
