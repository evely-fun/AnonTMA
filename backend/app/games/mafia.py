import random
from collections import Counter
from typing import Any

from app.games.base import Effect, GameEngine, GameMeta, deadline, remaining

NIGHT_SECONDS = 40
REVEAL_SECONDS = 8
INTRO_SECONDS = 60
DISCUSSION_SECONDS = 180
VOTE_SECONDS = 35
DEFENCE_SECONDS = 20

ROLE_MAFIA = "mafia"
ROLE_DON = "don"
ROLE_DOCTOR = "doctor"
ROLE_SHERIFF = "sheriff"
ROLE_CIVILIAN = "civilian"

# The don is mafia with a second job, so anywhere that asks "is this player
# mafia" has to accept both.
MAFIA_ROLES = (ROLE_MAFIA, ROLE_DON)
NIGHT_ROLES = (ROLE_MAFIA, ROLE_DON, ROLE_DOCTOR, ROLE_SHERIFF)


def _distribute(players: list[int]) -> dict[str, str]:
    pool = list(players)
    random.shuffle(pool)
    total = len(pool)
    mafia_count = max(1, total // 4)
    roles: dict[str, str] = {}

    # The first of the mafia is the don: someone has to have the last word.
    for index in range(mafia_count):
        roles[str(pool.pop())] = ROLE_DON if index == 0 else ROLE_MAFIA
    if total >= 5 and pool:
        roles[str(pool.pop())] = ROLE_DOCTOR
    if total >= 6 and pool:
        roles[str(pool.pop())] = ROLE_SHERIFF
    for remaining_player in pool:
        roles[str(remaining_player)] = ROLE_CIVILIAN
    return roles


class Mafia(GameEngine):
    meta = GameMeta(
        key="mafia",
        title="Mafia",
        subtitle="Voice deduction for 4 to 12 players",
        icon="🕵️",
        accent="#E0514C",
        min_players=4,
        max_players=12,
        voice_required=True,
        duration_minutes=15,
        tags=["voice", "party", "deduction"],
        rules=[
            "At night the mafia picks a victim, the doctor saves, the sheriff checks",
            "By day everyone speaks and votes for one suspect",
            "Town wins when every mafia is out, mafia wins when they equal the town",
        ],
    )

    def create(self, players: list[int], options: dict[str, Any]) -> dict[str, Any]:
        return {
            "phase": "lobby",
            "players": list(players),
            "alive": list(players),
            "roles": {},
            "day": 0,
            "nightActions": {},
            "votes": {},
            "checks": {},
            "donChecks": {},
            "lastHeal": None,
            "selfHealUsed": False,
            "log": [],
            "accused": None,
            "runoff": [],
            "deadline": None,
            "winner": None,
            "revealRoles": bool(options.get("revealRoles", True)),
        }

    def start(self, state: dict[str, Any]) -> list[Effect]:
        state["roles"] = _distribute(state["players"])
        # A minute to talk before the first night. People are remembered by
        # their voice, and the mafia are already deciding who goes first.
        state["phase"] = "intro"
        state["day"] = 1
        state["deadline"] = deadline(INTRO_SECONDS)
        state["skips"] = []
        state["log"].append({"day": 1, "text": "intro_started"})

        effects: list[Effect] = []
        mafia_team = [int(key) for key, role in state["roles"].items() if role in MAFIA_ROLES]
        for player in state["players"]:
            role = state["roles"][str(player)]
            effects.append(
                Effect(
                    event={
                        "type": "mafia.role",
                        "payload": {
                            "role": role,
                            "team": mafia_team if role in MAFIA_ROLES else [],
                        },
                    },
                    target="user",
                    user_id=player,
                )
            )
        effects.append(
            Effect(event={"type": "game.phase", "payload": {"phase": "intro", "day": 1}})
        )
        return effects

    def _open_night(self, state: dict[str, Any]) -> list[Effect]:
        state["phase"] = "night"
        state["nightActions"] = {}
        state["deadline"] = deadline(NIGHT_SECONDS)
        return [
            Effect(
                event={"type": "game.phase", "payload": {"phase": "night", "day": state["day"]}}
            )
        ]

    def action(
        self, state: dict[str, Any], user_id: int, action: str, payload: dict[str, Any]
    ) -> list[Effect]:
        if user_id not in state["alive"]:
            return []
        role = state["roles"].get(str(user_id), ROLE_CIVILIAN)
        target = int(payload.get("target", 0) or 0)

        if action == "night_action" and state["phase"] == "night":
            if target not in state["alive"] or role == ROLE_CIVILIAN:
                return []
            if role == ROLE_DOCTOR:
                if target == user_id and state.get("selfHealUsed"):
                    return []
                if target == state.get("lastHeal"):
                    return []
            if role in MAFIA_ROLES and state["roles"].get(str(target)) in MAFIA_ROLES:
                return []
            entry: dict[str, Any] = {"role": role, "target": target}
            if role == ROLE_DON and payload.get("inspect"):
                entry["inspect"] = int(payload["inspect"])
            state["nightActions"][str(user_id)] = entry
            effects = [
                Effect(
                    event={"type": "mafia.night_locked", "payload": {"target": target}},
                    target="user",
                    user_id=user_id,
                )
            ]
            if role in MAFIA_ROLES:
                for mate in self._mafia_alive(state):
                    if mate != user_id:
                        effects.append(
                            Effect(
                                event={"type": "mafia.team_pick", "payload": {"by": user_id, "target": target}},
                                target="user",
                                user_id=mate,
                            )
                        )
            if self._night_complete(state):
                effects += self._resolve_night(state)
            return effects

        if action == "vote" and state["phase"] == "vote":
            if target not in state["alive"] and target != 0:
                return []
            if state.get("runoff") and target not in state["runoff"]:
                return []
            state["votes"][str(user_id)] = target
            effects = [
                Effect(event={"type": "mafia.vote", "payload": {"by": user_id, "target": target, "count": len(state["votes"])}})
            ]
            if len(state["votes"]) >= len(state["alive"]):
                effects += self._resolve_vote(state)
            return effects

        if action == "skip_phase" and state["phase"] in ("intro", "discussion"):
            state["skips"] = list(set(state.get("skips", []) + [user_id]))
            if len(state["skips"]) > len(state["alive"]) // 2:
                state["skips"] = []
                if state["phase"] == "intro":
                    return self._open_night(state)
                return self._open_vote(state)
            return [Effect(event={"type": "mafia.skip", "payload": {"count": len(state["skips"])}})]

        return []

    def _mafia_alive(self, state: dict[str, Any]) -> list[int]:
        return [
            player
            for player in state["alive"]
            if state["roles"].get(str(player)) in MAFIA_ROLES
        ]

    def _night_complete(self, state: dict[str, Any]) -> bool:
        expected = {
            player
            for player in state["alive"]
            if state["roles"].get(str(player)) in NIGHT_ROLES
        }
        submitted = {int(key) for key in state["nightActions"]}
        return expected.issubset(submitted)

    def _resolve_night(self, state: dict[str, Any]) -> list[Effect]:
        picks = Counter()
        healed: int | None = None
        checked: tuple[int, int] | None = None

        don_check: tuple[int, int] | None = None
        for raw_id, entry in state["nightActions"].items():
            if entry["role"] in MAFIA_ROLES:
                picks[entry["target"]] += 1
                if entry["role"] == ROLE_DON and entry.get("inspect"):
                    don_check = (int(raw_id), int(entry["inspect"]))
            elif entry["role"] == ROLE_DOCTOR:
                healed = entry["target"]
            elif entry["role"] == ROLE_SHERIFF:
                checked = (int(raw_id), entry["target"])

        victim = picks.most_common(1)[0][0] if picks else None
        if picks:
            top = max(picks.values())
            tied = [player for player, count in picks.items() if count == top]
            if len(tied) > 1:
                for entry in state["nightActions"].values():
                    if entry["role"] == ROLE_DON and entry["target"] in tied:
                        victim = entry["target"]
                        break
        saved = victim is not None and victim == healed
        effects: list[Effect] = []

        if don_check is not None:
            don_id, suspect = don_check
            is_sheriff = state["roles"].get(str(suspect)) == ROLE_SHERIFF
            state["donChecks"].setdefault(str(don_id), {})[str(suspect)] = is_sheriff
            effects.append(
                Effect(
                    event={
                        "type": "mafia.don_result",
                        "payload": {"target": suspect, "isSheriff": is_sheriff},
                    },
                    target="user",
                    user_id=don_id,
                )
            )

        if checked is not None:
            detective_id, suspect = checked
            is_mafia = state["roles"].get(str(suspect)) in MAFIA_ROLES
            state["checks"].setdefault(str(detective_id), {})[str(suspect)] = is_mafia
            effects.append(
                Effect(
                    event={"type": "mafia.check_result", "payload": {"target": suspect, "isMafia": is_mafia}},
                    target="user",
                    user_id=detective_id,
                )
            )

        if victim is not None and not saved and victim in state["alive"]:
            state["alive"].remove(victim)
            state["log"].append({"day": state["day"], "text": "killed", "user": victim})
        elif saved:
            state["log"].append({"day": state["day"], "text": "saved", "user": victim})

        if healed is not None:
            state["lastHeal"] = healed
            if any(
                entry["role"] == ROLE_DOCTOR and entry["target"] == int(raw_id)
                for raw_id, entry in state["nightActions"].items()
            ):
                state["selfHealUsed"] = True

        state["nightActions"] = {}
        state["phase"] = "reveal"
        state["deadline"] = deadline(REVEAL_SECONDS)
        effects.append(
            Effect(
                event={
                    "type": "mafia.night_result",
                    "payload": {
                        "victim": None if saved else victim,
                        "saved": saved,
                        "alive": state["alive"],
                        "role": state["roles"].get(str(victim)) if victim and not saved and state["revealRoles"] else None,
                    },
                }
            )
        )
        outcome = self._check_end(state)
        return effects + outcome

    def _open_vote(self, state: dict[str, Any], runoff: list[int] | None = None) -> list[Effect]:
        state["phase"] = "vote"
        state["votes"] = {}
        state["skips"] = []
        state["runoff"] = list(runoff or [])
        state["deadline"] = deadline(VOTE_SECONDS)
        return [
            Effect(
                event={
                    "type": "game.phase",
                    "payload": {"phase": "vote", "day": state["day"], "runoff": state["runoff"]},
                }
            )
        ]

    def _resolve_vote(self, state: dict[str, Any]) -> list[Effect]:
        tally = Counter(value for value in state["votes"].values() if value)
        effects: list[Effect] = []
        eliminated: int | None = None

        if tally:
            count = max(tally.values())
            tied = sorted(player for player, votes in tally.items() if votes == count)
            if len(tied) == 1:
                # Most votes leaves. It used to need something close to an
                # outright majority, so a clear plurality could send nobody
                # home and the day simply evaporated.
                eliminated = tied[0]
            elif not state.get("runoff"):
                # A tie goes to a second round between the tied players only.
                effects.append(
                    Effect(event={"type": "mafia.runoff", "payload": {"between": tied}})
                )
                return effects + self._open_vote(state, tied)
            else:
                # A second tie settles nothing and nobody leaves today.
                effects.append(Effect(event={"type": "mafia.tie", "payload": {"between": tied}}))

        if eliminated and eliminated in state["alive"]:
            state["alive"].remove(eliminated)
            state["log"].append({"day": state["day"], "text": "voted_out", "user": eliminated})

        effects.append(
            Effect(
                event={
                    "type": "mafia.vote_result",
                    "payload": {
                        "eliminated": eliminated,
                        "role": state["roles"].get(str(eliminated)) if eliminated and state["revealRoles"] else None,
                        "tally": {str(key): value for key, value in tally.items()},
                        "alive": state["alive"],
                    },
                }
            )
        )

        ended = self._check_end(state)
        if ended:
            return effects + ended

        state["day"] += 1
        state["votes"] = {}
        state["runoff"] = []
        return effects + self._open_night(state)

    def _check_end(self, state: dict[str, Any]) -> list[Effect]:
        mafia = self._mafia_alive(state)
        town = [player for player in state["alive"] if player not in mafia]
        winner: str | None = None
        if not mafia:
            winner = "town"
        elif len(mafia) >= len(town):
            winner = "mafia"
        if winner is None:
            return []

        state["phase"] = "finished"
        state["winner"] = winner
        state["deadline"] = None
        return [
            Effect(
                event={
                    "type": "game.finished",
                    "payload": {"winner": winner, "roles": state["roles"], "alive": state["alive"]},
                }
            )
        ]

    def tick(self, state: dict[str, Any], now: float) -> list[Effect]:
        if not state.get("deadline") or now < state["deadline"]:
            return []
        phase = state["phase"]

        if phase == "intro":
            return self._open_night(state)
        if phase == "night":
            return self._resolve_night(state)
        if phase == "reveal":
            state["phase"] = "discussion"
            state["skips"] = []
            state["deadline"] = deadline(DISCUSSION_SECONDS)
            return [
                Effect(event={"type": "game.phase", "payload": {"phase": "discussion", "day": state["day"]}})
            ]
        if phase == "discussion":
            return self._open_vote(state)
        if phase == "vote":
            return self._resolve_vote(state)
        return []

    def player_view(self, state: dict[str, Any], user_id: int) -> dict[str, Any]:
        role = state["roles"].get(str(user_id))
        alive = user_id in state["alive"]
        finished = state["phase"] == "finished"
        visible_roles: dict[str, str] = {}

        if finished or not alive:
            visible_roles = dict(state["roles"])
        elif role in MAFIA_ROLES:
            visible_roles = {
                key: value for key, value in state["roles"].items() if value in MAFIA_ROLES
            }
        elif role is not None:
            visible_roles = {str(user_id): role}

        return {
            "phase": state["phase"],
            "day": state["day"],
            "players": state["players"],
            "alive": state["alive"],
            "yourRole": role,
            "youAlive": alive,
            "visibleRoles": visible_roles,
            "checks": state["checks"].get(str(user_id), {}),
            "donChecks": state["donChecks"].get(str(user_id), {}),
            "runoff": list(state.get("runoff", [])),
            "lastHeal": state.get("lastHeal") if role == ROLE_DOCTOR else None,
            "selfHealUsed": bool(state.get("selfHealUsed")) if role == ROLE_DOCTOR else False,
            "votes": state["votes"] if state["phase"] in ("vote", "finished") else {},
            "nightLocked": str(user_id) in state["nightActions"],
            "log": state["log"][-12:],
            "winner": state.get("winner"),
            "secondsLeft": remaining(state),
            "canAct": alive
            and (
                (state["phase"] == "night" and role in NIGHT_ROLES)
                or state["phase"] == "vote"
            ),
        }

    def scores(self, state: dict[str, Any]) -> dict[int, dict[str, Any]]:
        winner = state.get("winner")
        output: dict[int, dict[str, Any]] = {}
        for player in state["players"]:
            role = state["roles"].get(str(player), ROLE_CIVILIAN)
            team = "mafia" if role in MAFIA_ROLES else "town"
            won = winner == team
            survived = player in state["alive"]
            score = (60 if won else 15) + (20 if survived else 0) + state["day"] * 5
            output[player] = {"score": score, "won": won, "placement": 1 if won else 2}
        return output
