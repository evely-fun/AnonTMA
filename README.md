# Anon

Anonymous voice and text chat as a Telegram Mini App: random matchmaking, voice
rooms, five voice-first games, friends and calls, levels, streaks and
leaderboards.

## What is inside

| Area | Stack |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, CSS modules, framer motion, zustand |
| Backend | FastAPI, SQLAlchemy 2 async, PostgreSQL, Redis, WebSockets |
| Voice | WebRTC mesh with perfect negotiation, AudioWorklet noise suppression |
| Bot | aiogram 3 over webhook, referral deep links |
| Hosting | Render for the API, Cloudflare Pages for the mini app |

## Features

**Anonymous chat.** Every conversation issues a fresh mask, a generated name and
a generated avatar derived from the dialog id, so the same person looks
different in each chat. Telegram identity is only exchanged when both sides tap
reveal. Matchmaking scores candidates by shared language and interests, avoids
rematching the same pair for fifteen minutes, and respects blocks.

**Voice.** One to one calls and room mesh audio run over WebRTC. Noise
suppression has four levels and runs entirely on the device: a high pass and low
pass pair, a dynamics compressor, and an adaptive expander in an AudioWorklet
that tracks the noise floor and gates anything below the speech threshold.

The unprocessed microphone track is what goes on the wire first. The processing
graph only takes over once it has been observed producing audio, and a watchdog
compares the raw microphone against the processed output and falls back the
moment signal goes in without coming out. A suspended AudioContext, a blocked
worklet or a webview that refuses Web Audio therefore costs the effects, never
the call.

**Rooms.** Public voice tables with a topic, host controls, raised hands, mute
state, room chat and an optional game attached to the table.

**Games.** Server authoritative engines with per-player views, so roles and
words never leak through the socket.

- Mafia: night actions for mafia, doctor and detective, day discussion, voting
  with a majority rule, win checks after every phase
- Broken Telephone: audio is routed only between the current pair, the listener
  types what they heard, accuracy is scored with a sequence matcher
- Alias: teams, a shuffled deck, typed guesses matched against the word with
  stemming tolerance, skips cost a point, the table can flag a spoken violation
- Voice Flappy: microphone level is the only control, deterministic pipes from a
  shared seed, the server validates reported scores against elapsed time
- Tic Tac Toe: best of three with a 25 second move clock and a bot opponent

**Progression.** XP curve with titles, coins, daily streaks, fifteen
achievements, Elo style rating and leaderboards by XP, rating, voice time and
wins.

## Security

- Telegram `initData` validated with HMAC-SHA256 against the bot token, with a
  five minute replay window
- Short lived access tokens (30 min) plus refresh tokens (30 days), typed and
  issuer checked
- Redis token bucket rate limits on HTTP, auth and WebSocket frames
- WebRTC signalling is authorised per peer pair: a Redis set records who may
  exchange SDP with whom, so no one can relay into a stranger's session
- All database access goes through the ORM with bound parameters
- Input sanitising strips control and bidirectional characters, a spam filter
  blocks links and shouting, reports lower a trust score and auto-restrict at a
  threshold
- Strict CORS allow list, security headers on every response, AES-GCM helper for
  encrypting stored payloads

## Local development

```bash
docker compose up -d                    # postgres and redis

cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                    # fill in at least JWT_SECRET
ENVIRONMENT=development .venv/bin/uvicorn app.main:app --reload

cd ../frontend
npm install
cp .env.example .env                    # VITE_API_URL=http://localhost:8000
npm run dev
```

Without Telegram, `POST /api/v1/auth/dev?tg_id=1` issues tokens in development
mode so the app can be opened in a normal browser.

## Tests

```bash
cd backend && .venv/bin/python tests/smoke_realtime.py     # end to end realtime
cd frontend && npx tsc --noEmit && node scripts/browser-check.mjs
cd frontend && npm run check:gate                          # noise gate, no browser
cd frontend && npm run check:voice                         # two browsers, real audio
```

`check:gate` runs the suppressor worklet over two minutes of simulated speech
and fails if the gate ever starts swallowing the voice. `check:voice` opens two
browsers, matches them into one voice chat and fails unless both sides keep
receiving audio, so a regression that mutes the call is caught before deploy.
Both need the API and the dev server running.

## Deployment

See [DEPLOY.md](DEPLOY.md) for the full list of environment variables and the
step by step setup.
