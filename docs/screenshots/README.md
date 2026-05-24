# Screenshots

The top-level [README.md](../../README.md) references the filenames below. Drop PNGs (or animated GIFs / MP4s for the motion ones) here under exactly these names and they'll render in place — no further edits needed.

Suggested capture target: **1600 × 1000** for desktop UI, **750 × 1334** for any mobile shots, exported as PNG. For motion (drag-and-drop, live-updating tables) record a short GIF at the same resolution.

## Required

| File                          | What to capture                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `hero-standings.png`          | Web app home — the live league table for a current season. Hero image at the top of the README.          |
| `web-match-detail.png`        | A match page (`/match/:id`) showing the lineups column, events timeline, and header.                     |
| `web-predictions.png`         | The Projected Finish board mid-draft, with the unranked team pool visible.                               |
| `web-predictions-drag.gif`    | A short clip of dragging a team into a slot on the predictions board. Shows DnD + draft persistence.     |
| `web-account.png`             | The account page with the linked-identities panel and league-follows panel visible.                      |
| `admin-dashboard.png`         | Admin app overview — the dashboard with stat cards and the connection-status sidebar lit green.          |
| `admin-leagues.png`           | Admin Inventory view (Leagues Management) — the season importer + league config panel.                   |
| `admin-workers.png`           | Admin Workers view — running jobs, recent executions, and success/failure counts.                        |
| `admin-graphics.png`          | Admin Graphics view — the gallery with uploaded assets.                                                  |
| `graphql-playground.png`      | `http://localhost:8080/graphql` Yoga playground with a non-trivial query open (e.g. standings + viewer). |

## Optional / nice-to-have

| File                          | What to capture                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `web-login.png`               | The Google sign-in screen on the web app.                                                                |
| `admin-access-denied.png`     | The fail-whale "Access Denied" screen when a non-admin signs in.                                         |
| `architecture-diagram.png`    | A hand-drawn or excalidraw diagram of the three apps + Postgres + API-Football flow.                     |
| `auth-flow-diagram.png`       | Sequence diagram of the ID-token sign-in flow (browser → GIS → service → Better Auth → session cookie).  |
