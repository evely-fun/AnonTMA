import random
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

LINES = (
    (0, 1, 2), (3, 4, 5), (6, 7, 8),
    (0, 3, 6), (1, 4, 7), (2, 5, 8),
    (0, 4, 8), (2, 4, 6),
)
TURN_SECONDS = 25


def _winner(board: list[str]) -> tuple[str | None, tuple[int, int, int] | None]:
    for line in LINES:
        first, second, third = line
        if board[first] and board[first] == board[second] == board[third]:
            return board[first], line
    return None, None


def _best_move(board: list[str], mark: str, rival: str) -> int:
    empty = [index for index, value in enumerate(board) if not value]
    for candidate in (mark, rival):
        for index in empty:
            probe = list(board)
            probe[index] = candidate
            if _winner(probe)[0] == candidate:
                return index
    for index in (4, 0, 2, 6, 8, 1, 3, 5, 7):
        if index in empty:
            return index
    return random.choice(empty)


class TicTacToe(GameEngine):
    meta = GameMeta(
        key="tictactoe",
        title="Tic Tac Toe",
        subtitle="Classic duel, 25 seconds per move",
        icon="⚔️",
        accent="#6C8CFF",
        min_players=1,
        max_players=2,
        voice_required=False,
        duration_minutes=3,
        tags=["duel", "quick", "logic"],
        rules=[
            "Three in a row wins the round",
            "Each move has a 25 second limit",
            "Best of three decides the match",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        marks = {}
        ordered = list(players)
        random.shuffle(ordered)
        for index, player in enumerate(ordered):
            marks[str(player)] = "X" if index == 0 else "O"
        return {
            "phase": "lobby",
            "players": list(players),
            "withBot": bool(options.get("withBot")) or len(players) == 1,
            "marks": marks,
            "board": [""] * 9,
            "turn": ordered[0] if ordered else 0,
            "round": 1,
            "bestOf": int(options.get("bestOf", 3)),
            "wins": {str(player): 0 for player in players},
            "draws": 0,
            "line": None,
            "deadline": None,
        }

    def start(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "playing"
        state["deadline"] = deadline(TURN_SECONDS)
        if state["withBot"]:
            state["marks"].setdefault("0", "O")
            state["wins"].setdefault("0", 0)
        return [Effect(event={"type": "game.started", "payload": {"turn": state["turn"]}})]

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if action != "move" or state["phase"] != "playing":
            return []
        if state["turn"] != user_id:
            return [Effect(event={"type": "game.rejected", "payload": {"reason": "not_your_turn"}}, target="user", user_id=user_id)]

        index = int(payload.get("index", -1))
        if index < 0 or index > 8 or state["board"][index]:
            return [Effect(event={"type": "game.rejected", "payload": {"reason": "cell_taken"}}, target="user", user_id=user_id)]

        effects = self._place(state, user_id, index)
        if state["phase"] == "playing" and state["withBot"] and state["turn"] == 0:
            bot_index = _best_move(state["board"], state["marks"]["0"], state["marks"][str(user_id)])
            effects += self._place(state, 0, bot_index)
        return effects

    def _place(self, state: dict[str, Any], user_id: int, index: int) -> list[Effect]:
        mark = state["marks"][str(user_id)]
        state["board"][index] = mark
        effects = [
            Effect(event={"type": "game.move", "payload": {"index": index, "mark": mark, "by": user_id}})
        ]

        champion, line = _winner(state["board"])
        board_full = all(state["board"])
        if champion or board_full:
            if champion:
                state["wins"][str(user_id)] = state["wins"].get(str(user_id), 0) + 1
                state["line"] = list(line) if line else None
            else:
                state["draws"] += 1
            target_wins = state["bestOf"] // 2 + 1
            if champion and state["wins"][str(user_id)] >= target_wins:
                state["phase"] = "finished"
                state["winner"] = user_id
                effects.append(
                    Effect(event={"type": "game.finished", "payload": {"winner": user_id, "wins": state["wins"]}})
                )
            elif state["round"] >= state["bestOf"]:
                state["phase"] = "finished"
                state["winner"] = self._leader(state)
                effects.append(
                    Effect(event={"type": "game.finished", "payload": {"winner": state["winner"], "wins": state["wins"]}})
                )
            else:
                state["round"] += 1
                state["pendingReset"] = True
                state["deadline"] = deadline(4)
                effects.append(
                    Effect(event={"type": "game.round", "payload": {"round": state["round"], "winner": user_id if champion else None, "line": state["line"]}})
                )
            return effects

        state["turn"] = self._other(state, user_id)
        state["deadline"] = deadline(TURN_SECONDS)
        return effects

    def _other(self, state: dict[str, Any], user_id: int) -> int:
        participants = list(state["players"]) + ([0] if state["withBot"] else [])
        for candidate in participants:
            if candidate != user_id:
                return candidate
        return user_id

    def _leader(self, state: dict[str, Any]) -> int | None:
        ranking = sorted(state["wins"].items(), key=lambda item: item[1], reverse=True)
        if len(ranking) < 2 or ranking[0][1] > ranking[1][1]:
            return int(ranking[0][0]) if ranking else None
        return None

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if state["phase"] != "playing" or not state.get("deadline") or now < state["deadline"]:
            return []

        if state.pop("pendingReset", False):
            state["board"] = [""] * 9
            state["line"] = None
            state["turn"] = state["players"][(state["round"] - 1) % len(state["players"])]
            state["deadline"] = deadline(TURN_SECONDS)
            return [Effect(event={"type": "game.reset", "payload": {"turn": state["turn"]}})]

        empty = [index for index, value in enumerate(state["board"]) if not value]
        if not empty:
            return []
        forced = _best_move(state["board"], state["marks"][str(state["turn"])], "")
        return [
            Effect(event={"type": "game.timeout", "payload": {"user": state["turn"]}}),
            *self._place(state, state["turn"], forced),
        ]

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        return {
            "phase": state["phase"],
            "board": state["board"],
            "turn": state["turn"],
            "yourMark": state["marks"].get(str(user_id)),
            "marks": state["marks"],
            "round": state["round"],
            "bestOf": state["bestOf"],
            "wins": state["wins"],
            "line": state.get("line"),
            "winner": state.get("winner"),
            "withBot": state["withBot"],
            "secondsLeft": remaining(state),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        output: dict[int, dict[str, Any]] = {}
        ranking = sorted(
            ((int(key), value) for key, value in state["wins"].items() if int(key) != 0),
            key=lambda item: item[1],
            reverse=True,
        )
        for placement, (player, wins) in enumerate(ranking, start=1):
            output[player] = {
                "score": wins * 50,
                "won": state.get("winner") == player,
                "placement": placement,
            }
        return output
