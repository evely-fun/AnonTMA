# Outstanding work

Kept here rather than in a chat so it survives between sessions. Ordered by
what blocks the most.

## **1. Rework Broken Telephone to the real rules**

**Must be rebuilt, not patched.** Our engine is a voice whisper chain. The rules
we are working to describe a drawing chain:

- Everyone writes a situation in 30 seconds.
- The sheet passes on, the neighbour draws that situation in 60 seconds.
- The next player sees only the drawing and writes what they think it shows.
- Two rounds, then everyone votes for the best chain.

That needs a drawing canvas, per step image storage, a pass-the-sheet rotation
the server owns, and a gallery at the end. Roughly a new game sharing the
existing lobby.

## **2. Rework Alias to the real rules**

Our engine is two open teams racing a shared target. The rules are pairs of two
players and a fixed four rounds:

- Players are paired, one explains and one guesses, then they swap.
- A round is a fixed length, a skipped word costs a point.
- Four rounds total, the pair with the most words wins.

The word bank and the timer stay, the team model and the end condition change.

## **3. Full design optimisation pass**

**Every screen, once the rules work above are done.** Motion, spacing, empty
states, loading states, phone and desktop, both themes, both locales. No screen
exempt.

## Smaller, already known

- Per game card art: the games need their own illustrated cards beyond the
  covers, the same treatment across the set.
- Relay: the free Open Relay host is a stopgap. A dedicated coturn with
  `TURN_URLS` and `TURN_SECRET` set on the API service is the real answer, the
  code already mints REST credentials for it.
