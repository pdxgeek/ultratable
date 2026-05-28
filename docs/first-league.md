# Your First League — From API Key to Synced Teams

This guide takes you from a freshly-set-up clone to a fully synced league with teams, fixtures, and a live standings table in the web app. It assumes you've already completed [getting-started.md](getting-started.md) — i.e. `npm run setup` has finished and `npm run dev` brings up all three services.

If you want a deep dive on the admin pages used here, see [apps/admin/docs/inventory.md](../apps/admin/docs/inventory.md). This document is the happy-path walkthrough; that one is the reference.

## 1. Get a free API-Football key

UltraTable pulls fixtures, teams, players, and standings from [API-Football](https://www.api-football.com/). The free **Pro** tier is enough to bring up one or two leagues:

1. Sign up at <https://dashboard.api-football.com/register>.
2. Verify your email, then open the [dashboard](https://dashboard.api-football.com/).
3. Copy the key shown under **My Access** → **API Key**. It's a 32-character hex string.

Free-tier limits (100 requests/day at time of writing) are fine for a single league's initial sync; check the [pricing page](https://www.api-football.com/pricing) for the current numbers. The service caches aggressively, so repeat visits to the same data don't re-spend your quota.

> Three places you can land the key — pick whichever fits where you are:
>
> - **During `npm run setup`** — paste it at the `API_FOOTBALL_KEY` prompt.
> - **Re-run `npm run setup`** — if you already ran setup before signing up, just run it again. Existing values become the prompt defaults, so press Enter past everything else and paste the key at the API-Football prompt.
> - **From the admin UI** — leave the prompt blank and add it later under **Integrations** (covered in step 3 below).
>
> All three write to the same place (`API_FOOTBALL_KEY` in `apps/service/.env`); only one is needed.

## 2. Start the stack and sign in

```bash
npm run dev
```

This boots:

| URL                                            | What it is                                          |
| ---------------------------------------------- | --------------------------------------------------- |
| <http://localhost:5174>                        | Admin UI (where the rest of this guide takes place) |
| <http://localhost:5175>                        | Web UI (where you'll see the standings at the end)  |
| <http://localhost:8080/graphql>                | GraphQL playground (for poking the API by hand)     |

Open the admin at <http://localhost:5174>. You'll land on the Dashboard, but every GraphQL query will return 401 until you're signed in.

In the bottom-right corner of the admin, the **Dev Auth Tools** panel (dev-only) has an **Admin** button. Click it to mint a Better Auth session as a canned dev admin user. The 401s should clear.

> The dev-login endpoint (`/api/auth/dev-login`) only exists when `NODE_ENV=development`. In production you sign in via Google OAuth or email/password — see [auth-architecture.md](auth-architecture.md).

## 3. Configure the API-Football key (admin UI)

Skip this step if you already entered the key during `npm run setup`.

1. Admin sidebar → **Integrations**.
2. Paste your API-Football key into the input. The current state ("not set" / masked existing key) is shown above the field.
3. Click **Update Integration**.

The mutation writes the key into `apps/service/.env` and reloads the provider. The header above the form should flip to **Configured** within a couple of seconds.

> The key is masked in the UI after save (`29da…7bc4`). To swap it later, paste a new value over the masked one and re-submit.

## 4. Inventory your first league

Admin sidebar → **Inventory**. The page is a three-box drill-down:

> **country (Box 1) → activated league (Box 2) → season (Box 3)**

### Box 1 — Initialize the catalog and activate a league

The first time you open this page, Box 1 shows a single **Initialize Catalog** button.

1. Click **Initialize Catalog**. This calls `syncCatalog`, which pulls the full list of countries and leagues from API-Football into the local `catalog_*` tables. ~10–30 seconds.
2. Once it finishes, a country dropdown appears. Pick one — e.g. **England**, **Spain**, **Germany**.
3. The first time you pick a country, a spinner runs while leagues for that country are lazy-fetched (`syncCountryLeagues`). On subsequent visits this is instant.
4. A scrollable table of leagues appears. Find one you care about (e.g. **Premier League**, **La Liga**, **Bundesliga**) and click **Activate**.

The row's badge flips to **Active** and the league becomes selectable in Box 2.

> Nothing is auto-activated. Only leagues you explicitly **Activate** here become part of your installation.

### Box 2 — Import a season

With a league activated:

1. Pick that league from Box 2's dropdown (it's filtered to leagues whose country matches Box 1).
2. The table now shows every season year the provider offers, each marked **Imported** or **Available**.
3. Click **Import** on the season year you want — e.g. `2024` for the 2024/25 season.

This creates a row in `seasons` but does **not** yet fetch teams or fixtures.

### Box 3 — Sync season data (teams + fixtures)

With a season imported:

1. Pick that season in Box 3.
2. Open the **Sync Season Data** action (the actual button label may render as "Sync Season Data" or similar).
3. Confirm. This calls `syncFixtures`, which fetches every team, venue, and fixture for that season from API-Football and upserts them into `teams`, `venues`, `fixtures`, and `seasons_to_teams`.

The sync runs as a background job. Switch to the **Workers** tab in the sidebar to watch it progress — `JobExecution` rows show start time, status, and any errors. A full Premier League season is roughly 20 teams + 380 fixtures and takes 30–90 seconds depending on the provider's response time.

## 5. See it on the web

Open <http://localhost:5175>.

The web app reads from the same database via GraphQL, deltas it into Dexie (IndexedDB), and renders the standings. You should now see:

- the league + season you just synced in the league picker,
- the table of teams sorted by the default EFL ranking criteria (`standard_pts → goal_diff → goals_for → head_to_head → wins → away_goals`),
- fixture data backing the row counts (matches played, wins, draws, losses, GF/GA/GD, points).

If the table is empty, check the Workers tab in the admin — the sync job may still be running, or may have failed. The job's error message is the canonical place to look first.

## 6. (Optional) Tweak the ranking criteria

Box 3 in the Inventory page has two tabs — **Season** and **League** — for editing `metadata.rankingCriteria` and the promotion / playoffs / relegation zones. The **Season** tab edits the row you just synced; the **League** tab edits the template inherited by *future* season imports. Editing the league does not retroactively touch existing seasons. Full details: [inventory.md → Configuration & Data Sync](../apps/admin/docs/inventory.md#box-3--configuration--data-sync).

## Where to next

- Add a second league: repeat steps 4 and 5. The catalog is already populated, so you start from "pick a country" in Box 1.
- Schedule recurring fixture refreshes: see [docs/workers.md](workers.md) for the background-job model.
- Understand the data flow end-to-end: [AI_README_FIRST.MD §3 Cache Isolation](../AI_README_FIRST.MD#3-cache-isolation) and [§7 Provider Rate Limiting](../AI_README_FIRST.MD#7-provider-rate-limiting).
- Wire production auth + deploy: [DEPLOYMENT.md](DEPLOYMENT.md).
