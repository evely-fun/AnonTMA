# Outstanding work

Kept here rather than in a chat so it survives between sessions. Ordered by
what blocks the most. Everything below comes from the brief, plus Emil's
comments on it.

## **1. City Mafia, the real one**

**The make or break feature.** A separate game from the casual four player
Mafia we already ship, which stays as it is.

- Ten players plus a host. Roles: two Mafia, a Don, a Sheriff, a Doctor and
  five Civilians. Seats are numbered one to ten and a player is referred to by
  their number.
- Night, sixty seconds: the black team agrees on one number, and a miss is a
  real outcome when they do not agree. The Don looks for the Sheriff, the
  Sheriff checks one player, the Doctor saves one and may save themselves only
  once and never the same person twice running.
- Day: a circle of one minute speeches in seat order, each player may nominate
  one number, then a vote on the nominated in nomination order.
- A tie gives each tied player thirty seconds more and a revote. A second tie
  on the same players puts the whole table to a vote, and if that does not
  carry, nobody leaves.
- Whoever leaves gets a minute of last words.
- Fouls: the third costs the player their speech, the fourth takes them off the
  table with no last words. Two warnings do the same.
- The host needs a panel: give a foul or a warning, put someone back, open and
  close each phase, end the game.
- The black team needs a night channel of their own, and the Doctor and the
  Sheriff need a private line to the host.

Reference: the Discord bot Denys bought (rules and flow only, our own code) and
the federation rules at dom-mafia.ru and gomafia.pro.

## **2. Bunker to the official rules**

Rebuild against https://bunker-online.com/ru/rules.

- Six to fifteen players, places are half the table rounded down.
- A minute of introduction per player, a minute of general discussion, thirty
  seconds of defence each, fifteen seconds to vote.
- How many traits open per round comes from a table keyed on the player count,
  and the profession always opens in round one.
- Seventy percent of the votes excludes at once. A plurality under that gives
  thirty seconds of defence and a revote. A tie does the same. A tie on the
  revote excludes everyone tied, except in round one, which never excludes.
- Seven rounds at most, and the game ends as soon as the bunker is full.
- Action cards are barred during last words.

## **3. Staff roles and rights**

Owner, Admin, Moderator, Helper, each with its own rights. Moderation stays out
of the support queues below.

## **4. Support**

A button that opens a ticket with a category: technical, shop, report, a
question about the app or a game. App and game questions go to Helpers.
Technical and shop go to Admins and the Owner. Moderators see none of it.
Everything is threaded and answerable in the app.

## **5. Economy**

- A Telegram Stars shop.
- Much bigger rewards for an invite, weighted to the first few.
- Streak freezes in the Duolingo shape: a freeze is spent automatically on a
  missed day, and can be bought and stockpiled.

## **6. Home**

Two entry points instead of one: find someone to text, and find someone to
talk to. Each with its own art.

## **7. Cosmetics**

- A real avatar pack, not the textbook set: cat ears, soft characters, a set
  with some attitude for the boys.
- Frames with ears, looped animated decorations.
- Many more name effects.
- Every asset generated in our own style, backgrounds cut, checked against a
  real card before it ships.

## **8. Alias**

Pairs of two players, four rounds, a skipped word costs a point.

## **9. Broken Telephone**

The drawing chain: write a situation in thirty seconds, the neighbour draws it
in sixty, the next writes what they see. Two rounds, then a vote on the best
chain. Needs a canvas and per step image storage.

## **10. Full design pass**

Every screen once the above lands. Motion, spacing, empty and loading states,
phone and desktop, both themes, both locales.

## Known smaller items

- Per game illustrated cards, the same treatment across the set.
- A dedicated coturn instead of the free Open Relay host: set `TURN_URLS` and
  `TURN_SECRET` on the API service, the code already mints REST credentials.
