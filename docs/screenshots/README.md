# Screenshots

PNGs in this directory back the image references in the top-level [README.md](../../README.md). Captured at 1600×1000 via headless Chrome against a local `npm run dev` stack — see [`scripts/capture-screenshots.mjs`](../../scripts/capture-screenshots.mjs) (puppeteer-core driving the user's system Chrome, dev-login + sessionStorage to hide the floating Dev Auth Tools panel before each shot).

## Currently captured

| File                       | What it shows                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `hero-standings.png`       | Web home — live league table (Championship 2025) with form column, GD/PTS, next opponent.    |
| `web-match-detail.png`     | A match page (Man City 0–2 Tottenham): stadium hero, lineups columns, events timeline.       |
| `web-predictions.png`      | Projected Finish board mid-draft, unranked team pool + numbered drop slots.                  |
| `web-account.png`          | Account page — profile, connected identities (Credential), roles.                            |
| `web-login.png`            | Sign-in screen with "Continue with Google" CTA.                                              |
| `admin-dashboard.png`      | Admin Overview — status cards (Postgres / Supabase / API-Football), System Health panels.    |
| `admin-leagues.png`        | Admin Inventory — Catalog Browser with England selected, Championship marked Active.         |
| `admin-workers.png`        | Admin Workers — active jobs, recent execution history with records + API call counts.        |
| `admin-graphics.png`       | Admin Graphics — gallery of registered team / venue / league / player crests.                |
| `graphql-playground2.png`  | Yoga GraphiQL playground — schema explorer panel with a sample `allSeasons` query.           |
| `ranking.png`              | Tier List ranking view ("Best Coaches") with S/A/B/C/D rows and pool of unranked entries.    |

## Refreshing the screenshots

```bash
# 1. Make sure the stack is up
npm run dev

# 2. Once-only: install puppeteer-core somewhere on NODE_PATH
cd /tmp && npm install puppeteer-core

# 3. Run the capture (overwrites PNGs in this directory)
NODE_PATH=/tmp/node_modules node scripts/capture-screenshots.mjs
```

If the README starts referencing a new screenshot, add a row to the table above and a capture block to [`scripts/capture-screenshots.mjs`](../../scripts/capture-screenshots.mjs) — keep this directory the source of truth for "what's actually in the README."
