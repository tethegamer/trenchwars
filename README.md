# ⚔ TrenchWars

A **free-to-play** memecoin community arcade with a dark neon degen look. Players sign in, get free credits, play **Crash, Coinflip and Blackjack**, and race up a **weekly leaderboard**. The site owner can give away memecoin prizes they fund themselves.

> **No purchase necessary. Credits have no cash value and can't be bought or withdrawn.** There are no deposits, no payments and no withdrawals anywhere in the code.

## Features
- **Sign in**: connect a **Phantom** Solana wallet and sign a message (ed25519 verified on the server; no transactions, no approvals). You can also use a username and password.
- **Free credits**: 1,000 on signup, plus 500 free every 24h.
- **Crash**: animated multiplier curve, manual or auto cash out. The server clock decides results; the client just draws them.
- **Coinflip**: pays 1.96×.
- **Blackjack**: hit, stand, double. Dealer stands on all 17s. Blackjack pays 3:2.
- **Provably fair**: `HMAC_SHA256(serverSeed, clientSeed:nonce)`. You can see the server-seed SHA-256 hash before playing. Rotating reveals the old seed, and there's a built-in verifier. The Blackjack deck is a Fisher-Yates shuffle from the same stream (see `fair.js`).
- **Weekly leaderboard**: ranked by net credits won. Resets every Monday 00:00 UTC (weeks are keyed by date, so older weeks are kept).
- **Prizes and admin**: `/admin` is protected by the `ADMIN_PASSWORD` env var. Set the prize title, note and prizes for ranks 1–10. You can see this week's and last week's top 10 with wallet addresses so you can pay winners by hand.
- `/rules` official rules page. Optional sound effects (off by default). Mobile friendly.

## Run
```bash
npm install
ADMIN_PASSWORD=changeme npm start     # http://localhost:3000
npm test                             # API + game + leaderboard tests (node:test)
npm run screenshot                   # headless Chrome smoke test (needs CHROME_PATH or /usr/bin/google-chrome)
```
Env: `PORT` (3000), `ADMIN_PASSWORD` (required for /admin), `DATA_FILE` (default `data/db.json`).

## Storage
A single JSON file with atomic writes. That's fine for a community-sized game. For bigger traffic, swap `db.js` for SQLite or Postgres.

## Deploy on Render
`render.yaml` sets up a **free** web service. **Persistence caveat:** free instances have an ephemeral disk, so all accounts, credits and leaderboards reset on every deploy or restart, and the service sleeps when idle. For a real competition, use a paid instance with a persistent disk (`DATA_FILE=/var/data/db.json`) or an external database.

## Legal-ish
This is a sweepstakes-style free game. Prizes are owner-funded giveaways and entry is always free. Check the giveaway laws where you and your players live, and keep the rules page accurate.
