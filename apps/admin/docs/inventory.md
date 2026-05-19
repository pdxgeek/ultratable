# Inventory

Path: admin sidebar → **Inventory**.
Source: [LeaguesManagementView.tsx](../src/components/LeaguesManagementView.tsx) (the tab id is `leagues` for historical reasons; the user-facing label is "Inventory").

The page is a hierarchical drill-down for inventorying football data:

> **country (Box 1) → activated league (Box 2) → season (Box 3)**

Each box scopes the one below it. Selections in Box 1 cascade down. If no country is picked, Boxes 2 and 3 stay empty by design.

---

## Box 1 — Catalog Browser

Component: [CatalogBrowser.tsx](../src/components/CatalogBrowser.tsx).

**Purpose:** browse the upstream provider catalog (countries → leagues) and *activate* a league for use in this UltraTable installation.

**States:**

| State | Trigger | What renders |
|---|---|---|
| Empty catalog | `catalog_countries` is empty | "Initialize Catalog" button calling `syncCatalog` mutation (pulls countries + leagues globally) |
| Populated, no country selected | Default after init | Country dropdown only; instructions to select one |
| Country selected, leagues unknown | First time picking this country | Spinner; calls `syncCountryLeagues(countryId)` mutation to lazy-fetch leagues from API-Football, persists into `catalog_leagues` |
| Country selected, leagues known | Subsequent visits | Scrollable table (max-height ~420px, sticky header) of catalog leagues. Each row: logo, name, type, and an action button. |

**Activation action:** the **Activate** button calls the `promoteLeague(catalogId)` mutation, which inserts a row into `leagues` (the managed table) seeded from the catalog metadata, including a default `rankingCriteria` (see [Configuration](#box-3--configuration--data-sync)). Once a league is managed, the row badge flips to **Active** and the league becomes selectable in Box 2.

**Important:** no league is auto-activated. Only explicit user activation writes to `leagues`.

---

## Box 2 — Season Importer

Component: [SeasonImporter.tsx](../src/components/SeasonImporter.tsx).

**Purpose:** for an activated league, see the seasons the provider offers and import them as local seasons.

**Filtering:** the league dropdown shows only `leagues` whose `country` matches the country selected in Box 1. If no country is selected, the box renders an empty state with a prompt; the dropdown is hidden.

**Flow:**
1. Pick a managed league. The box fetches:
    - the catalog metadata for that league (`catalogLeagues(sourceId)`) — provides the list of available season years from the upstream provider;
    - the local seasons already imported for it (`seasons(leagueId)`).
2. The table merges both: each row is a season year showing **Imported** or **Available**.
3. **Import** button (Available rows) → `importSeason(leagueId, year)` mutation. This creates a `seasons` row, seeded with the league's `metadata.rankingCriteria` (the season is the source of truth from that point — see below). It does *not* sync fixtures.
4. **Remove** button (Imported rows) → `removeSeason(seasonId)` mutation. Cascades to fixtures, standings, etc.
5. **Fetch Catalog Seasons** button → `refreshCatalogSeasons(catalogId)` mutation re-asks the provider what season years are available for this league.

---

## Box 3 — Configuration & Data Sync

Component: [LeagueConfig.tsx](../src/components/LeagueConfig.tsx).

**Purpose:** configure rules that drive the standings table for a specific league/season.

**Two tabs:**

| Tab | Stored on | Mutation | When to use |
|---|---|---|---|
| **Season** | `seasons.metadata` | `saveSeasonConfig(seasonId, configJson)` | Per-year customisations (e.g. point deductions specific to one season). **This is the source of truth used by the web app.** |
| **League** | `leagues.metadata` | `saveLeagueConfig(leagueId, configJson)` | The template inherited by *new* seasons at import time. Editing the league does **not** retroactively update existing seasons. |

**Configurable fields:**

- `promotion` — array of finishing positions (e.g. `[1, 2]`) shown as the promotion zone.
- `playoffs` — array of finishing positions (e.g. `[3, 4, 5, 6]`).
- `relegation` — array of finishing positions (e.g. `[22, 23, 24]`).
- `deductions` (season only) — array of `{ teamId, points, reason }` entries; negative `points` reduces the team's total and renders an asterisk footnote.
- `rankingCriteria` — ordered list of `RankingFormula` IDs used by the standings sort.

### Ranking criteria

The standings sort runs each formula in order, short-circuiting on the first non-zero comparison. So criteria are *tiebreakers*, not parallel sort keys — if Points already separates two teams, none of the other formulas execute.

Available formulas (rows in `ranking_formulas`):

| ID | Name | Logic |
|---|---|---|
| `standard_pts` | Points | 3 for a win, 1 for a draw. |
| `goal_diff` | Goal Difference | Goals for − goals against, across the season. |
| `goals_for` | Goals For | Total goals scored. |
| `head_to_head` | Head-to-Head | Within the matches between the tied teams: points → goal difference → goals scored. |
| `wins` | Wins | Total wins. |
| `away_goals` | Away Goals Scored | Total goals scored as the away team. |

**Default order (mirrors EFL):** `standard_pts → goal_diff → goals_for → head_to_head → wins → away_goals`.

Defined as `DEFAULT_RANKING_CRITERIA` in [supabase.repository.ts](../../service/src/repositories/supabase.repository.ts); kept in sync with the resolver fallback in [football.ts](../../service/src/schema/football.ts).

### Inheritance model

- `promoteLeague` writes the default `rankingCriteria` into the new `leagues.metadata`.
- `importSeason` reads the league's `metadata.rankingCriteria` and copies it onto the new `seasons.metadata` at creation time.
- After that, the season is independent. Editing the season config never touches the league; editing the league only affects *future* seasons.
- The GraphQL resolver for `season.rankingCriteria` preserves the order in metadata (it maps by criteria ID rather than filtering, so the configured precedence is honoured).

### Sync data

The same tab carries a **Sync Season Data** action which calls `syncFixtures(leagueSourceId, seasonYear)`. This fetches all teams + fixtures for the season from API-Football, upserts them, and invalidates the seasonId-keyed caches so the web app's next delta sync picks them up. Runs via the `JobRunner` so progress is observable in the Workers tab.

---

## Playoff handling

Playoff fixtures are stored alongside regular-season fixtures in the `fixtures` table. They are distinguished by `gameweek IS NULL` (the round string from the provider is something like `"Play-offs - Semi-finals"`, which has no integer round number).

The web's standings hook filters them out before computing the league table. They are still available in Dexie for future "playoff bracket" views.

---

## Quick reference — mutations touched by this page

| Mutation | Triggered by | Writes |
|---|---|---|
| `syncCatalog` | "Initialize Catalog" button | `catalog_countries`, `catalog_leagues` |
| `syncCountryLeagues(countryId)` | First time a country is selected | `catalog_leagues` (for that country) |
| `promoteLeague(catalogId)` | "Activate" button | `leagues` |
| `refreshCatalogSeasons(catalogId)` | "Fetch Catalog Seasons" button | `catalog_leagues.metadata.seasons` |
| `importSeason(leagueId, year)` | "Import" button (Available row) | `seasons` |
| `removeSeason(seasonId)` | "Remove" button (Imported row) | deletes `seasons`, cascades |
| `syncFixtures(leagueSourceId, year)` | "Sync Season Data" button | `teams`, `fixtures`, `seasons_to_teams`, `venues` |
| `saveLeagueConfig(leagueId, configJson)` | Box 3 → League tab → Save | `leagues.metadata` |
| `saveSeasonConfig(seasonId, configJson)` | Box 3 → Season tab → Save | `seasons.metadata` |
