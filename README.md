# UltraTable

> **First-class football stats for clubs, fans, and streamers — built end-to-end by one engineer + AI agents.**

UltraTable is two products in one codebase: a **first-class stats surface** for football clubs of all sizes (live league tables, match detail, lineups, event timelines) and a **streamer engagement utility** for TikTok / YouTube broadcasts (Predictions, Tier Lists, and Stream Overlays on the roadmap). It's a TypeScript monorepo — Fastify + GraphQL Yoga + Drizzle on the back, two React 19 SPAs on the front, deployed across Fly.io and Vercel.

This README is also my portfolio. If you're evaluating me for a senior / principal back-end or full-stack role, the [Engineering](#engineering--the-decisions-behind-the-product) section is where I show my work — the architectural decisions, the load-bearing constraints, and the trade-offs I made deliberately. The features below exist to show you what those decisions are in service of.

> **Source-visible, not open-source.** This codebase is published for portfolio review. You may clone and run it locally on your own machine (loopback only) to evaluate it — see [LICENSE](LICENSE) for the full terms. Hosting, public deployment, modification beyond local config, and redistribution are not permitted. For commercial licensing, contact **pdxgeek@gmail.com**.

---

## Table of contents

- [What it does](#what-it-does)
    - [For clubs and fans](#for-clubs-and-fans)
    - [For streamers](#for-streamers)
    - [Operator console](#operator-console)
- [Engineering — the decisions behind the product](#engineering--the-decisions-behind-the-product)
    - [Tech stack at a glance](#tech-stack-at-a-glance)
    - [How architectural rules survive contributor churn](#how-architectural-rules-survive-contributor-churn)
    - [How upstream API calls are minimized and bounded](#how-upstream-api-calls-are-minimized-and-bounded)
    - [How updates reach users without polling the upstream](#how-updates-reach-users-without-polling-the-upstream)
    - [How long imports stay off the 15s GraphQL ceiling](#how-long-imports-stay-off-the-15s-graphql-ceiling)
    - [How Predictions stay replayable months later](#how-predictions-stay-replayable-months-later)
    - [How Graphics avoid duplicates and SSRF](#how-graphics-avoid-duplicates-and-ssrf)
    - [How two SPAs avoid becoming a monolith](#how-two-spas-avoid-becoming-a-monolith)
    - [How two products share auth without leaking sessions](#how-two-products-share-auth-without-leaking-sessions)
    - [What survives a backend or provider swap](#what-survives-a-backend-or-provider-swap)
    - [Tested where it matters](#tested-where-it-matters)
- [Built with AI agents as a force multiplier](#built-with-ai-agents-as-a-force-multiplier)
- [Roadmap](#roadmap)
- [Run it locally / deploy it](#run-it-locally--deploy-it)

---

## What it does

### For clubs and fans

The web app at `apps/web` is a fan-facing surface for any league API-Football covers. Click a country flag, pick a league, get a live table.

![Live league standings](docs/screenshots/hero-standings.png)

- **Live league tables** that recompute from cached fixtures + delta-synced updates — no stale CDN-snapshot feel.
- **Match detail pages** with both teams' lineups, formation, substitutions, goals, cards, and a chronological event timeline.

  ![Match detail with lineups and timeline](docs/screenshots/web-match-detail.png)

- **Filterable views** (Home / Away / All) computed client-side from the same delta-synced fixture set so swapping the filter is instant.
- **Account pages** with linked identities (Google + credentials), per-league follows, and a self-service "wipe my data" mutation.

  ![Account page with linked identities and league follows](docs/screenshots/web-account.png)

### For streamers

The wedge for the paid product. Streamers want to make a prediction live on camera, save it, then come back next match-week and show the audience how the table actually played out vs. the prediction.

- **Projected Finish predictions** — drag-and-drop a current league's teams into a top-to-bottom finishing order. Drafts persist in **IndexedDB (Dexie)** keyed per `(viewer, season, type)`, so refreshing the page mid-prediction doesn't cost the user their work, and switching seasons swaps to a clean draft.

  ![Predictions / Projected Finish board](docs/screenshots/web-predictions.png)

- **Lock-in and history**. When the streamer hits *Lock in*, the prediction becomes an immutable snapshot. The history panel lets them re-load a previous snapshot to compare against the live table.
- **Tier Lists** (recipe-registry-backed; see [apps/service/src/schema/tier-lists.ts](apps/service/src/schema/tier-lists.ts)) — the same drag-and-drop primitive, now generalized so any `TierRankableType` (teams, players, fixtures, future entities) plugs in.

  ![Tier List ranking — Best Coaches](docs/screenshots/ranking.png)

- **Stream Overlays** are next on the roadmap — thin, low-latency overlay renderers that read from the same GraphQL surface. The data layer is already designed for them; see [Roadmap](#roadmap).

### Operator console

`apps/admin` is the back-office for me-as-the-operator: import a league season, watch the ingest workers run, inspect the cache, manage uploaded graphics, read structured logs. It's the **same** GraphQL surface the public app uses — the admin only sees more of it because CASL says so.

![Admin dashboard with connection status sidebar](docs/screenshots/admin-dashboard.png)

| Section          | What it does                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| **Overview**     | Stat cards for DB connectivity, API-Football key health, recent worker activity.                              |
| **Inventory**    | Browse the catalog of leagues, import a season (queues a worker job), edit season config.                     |
| **Integrations** | Rotate the API-Football key without redeploying.                                                              |
| **Infrastructure** | Inspect / configure DB credentials (masked) and Supabase wiring.                                            |
| **Workers**      | Live job list, last 20 executions with status + counts, manual re-run.                                        |
| **Graphics**     | Asset upload + gallery, backed by Supabase storage in prod / MinIO locally.                                   |
| **Logs**         | Tail the last 100 structured Pino records straight from the DB (debug-level logs never hit the database).     |

![Admin Inventory — leagues management](docs/screenshots/admin-leagues.png)
![Admin Workers view](docs/screenshots/admin-workers.png)
![Admin Graphics gallery](docs/screenshots/admin-graphics.png)

---

## Engineering — the decisions behind the product

Most of this section links to the actual file where the decision is enforced. Click through — I'd rather you check the code than take my word for it.

### Tech stack at a glance

| Layer            | Choice                                                              | Why                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime          | **Node 24** (Volta-pinned)                                          | Native fetch, stable AbortController semantics, top-level await.                                                                                             |
| Web framework    | **Fastify 5** + plugins (`cors`, `cookie`, `rate-limit`)            | Schema-first request validation, fastest mainstream Node server, plugin model that doesn't fight TypeScript.                                                 |
| GraphQL          | **GraphQL Yoga 5** + **Pothos 4** code-first schema                 | Yoga for the runtime (subscriptions-ready, plays with Fastify); Pothos because code-first GraphQL with strict TS inference beats SDL hand-stitching at scale. |
| GraphQL safety   | **graphql-query-complexity** + **DataLoader**                       | Cost limits per request; per-request batchers prevent N+1s by *construction*.                                                                                |
| DB               | **Postgres** via **Drizzle ORM** (migration-first)                  | Drizzle's `$inferSelect`/`$inferInsert` give end-to-end type safety from column → resolver → frontend. Migrations are the canonical path; no `db:push` in CI.|
| Auth             | **Better Auth** (Google OAuth + credentials) + **CASL** for authz   | Better Auth handles sessions + OAuth properly; CASL gives one declarative rule shape shared by server and both frontends.                                    |
| Caching          | **lru-cache** (in-process, per-pod) + Postgres as the system of record | Two-tier: raw API responses keyed by remote ID, mapped domain objects keyed by internal UUID — they never collide.                                         |
| Logging          | **Pino** (structured) → DB sink for warn+                           | Debug-level never hits the DB. Logs are a feature surface (admin Logs view), not just stderr.                                                                |
| Frontends        | **React 19** + **Vite** + **Tailwind v4** + **shadcn/ui** + **Radix** | shadcn/ui vendored into each app so they stay independently buildable. No bespoke focus traps, click-outside handlers, or popup positioning.               |
| Web data layer   | **urql** (GraphQL) + **Dexie** (IndexedDB) for drafts               | urql for normalized GraphQL caching; Dexie for offline-tolerant drag-and-drop drafts the user shouldn't lose.                                                |
| Drag-and-drop    | **@dnd-kit**                                                        | Accessible, virtualization-friendly, modern React.                                                                                                           |
| Storage          | **Supabase Storage** (prod) / **MinIO** (local)                     | S3-compatible local dev means upload code paths are exercised on every PR, not just in prod.                                                                 |
| Hosting          | **Fly.io** (service, always-on Docker) + **Vercel** (web, admin)    | Fly because the GraphQL service needs a long-lived process. Vercel because the SPAs are static + edge rewrites do the OAuth same-origin trick (below).       |
| Quality bar      | **Vitest** unit + integration, **ESLint** zero-warning, **Prettier** | Lint warnings block merge. No `any`. Strict TS everywhere.                                                                                                   |

### How architectural rules survive contributor churn

These are the **non-negotiable rules** I codified in [AI_README_FIRST.MD](AI_README_FIRST.MD). Every one came from a hard-won bug or a foreseeable failure mode. Both human contributors and AI agents inherit the same guardrails, so the constraints don't get re-litigated per PR.

- **External IDs never leak into internal logic.** Every row's primary key is a Postgres UUID. Upstream provider IDs (api-football's league `40`, etc.) live in `source_id` columns and are never accepted where a UUID is expected. GraphQL args that take a provider ID use a `sourceId` suffix; every schema field has a `description` documenting which kind of ID it expects; and [schema-descriptions.test.ts](apps/service/src/schema/schema-descriptions.test.ts) asserts it. ([§1](AI_README_FIRST.MD))
- **The schema absorbs new display fields without migrations.** A column only exists if the database needs to join on it, index it, filter on it, or sort by it. Everything else lives in `metadata: jsonb`. Display fields don't get DDL.
- **Timestamp precision doesn't drift.** Every timestamp column is `timestamptz(3)` — millisecond precision, UTC. A `utcTimestamp()` helper in [db/schema.ts](apps/service/src/db/schema.ts) is the only sanctioned declaration; server-side timestamps use `NOW_MS` (a `date_trunc('milliseconds', now())` wrapper) instead of bare `now()`. Microsecond drift caused phantom delta-sync bugs once — never again.
- **Resolvers don't know the storage backend.** Every resolver imports `{ repository }` from [repositories/](apps/service/src/repositories) — a runtime singleton typed against an interface. The Postgres backend lives in `repositories/postgres/` as per-domain sub-repos. Swapping the backend is a one-line change at the index file; resolvers never know.
- **Nested resolvers can't accidentally N+1.** Any field that fetches a row by a parent's foreign key (`Fixture.homeTeam`, `Team.venue`, …) goes through a per-request DataLoader in [loaders/index.ts](apps/service/src/loaders/index.ts). The rule exists because a direct `db.select().where(eq(id, parent.fooId))` is the silent N+1 that takes a list query from 50ms to 5s.
- **Authorization never lives inline.** A single per-request `ctx.ability` (CASL) decides every gate on the server; the same rule shape is mirrored to both frontends so the "button shows but the click 403s" class of bug can't exist.
- **The GraphQL surface is split by domain, not piled into one file.** One Pothos builder, ten modules: [football.ts](apps/service/src/schema/football.ts), [predictions.ts](apps/service/src/schema/predictions.ts), [tier-lists.ts](apps/service/src/schema/tier-lists.ts), [catalog.ts](apps/service/src/schema/catalog.ts), [graphics.ts](apps/service/src/schema/graphics.ts), [workers.ts](apps/service/src/schema/workers.ts), [viewer.ts](apps/service/src/schema/viewer.ts), [account.ts](apps/service/src/schema/account.ts), [config.ts](apps/service/src/schema/config.ts), [seasonConfig.ts](apps/service/src/schema/seasonConfig.ts). No 5000-line monolithic schema; the playground is mounted in non-prod for hands-on exploration.

  ![GraphQL Yoga playground with schema explorer and a sample query](docs/screenshots/graphql-playground2.png)

### How upstream API calls are minimized and bounded

The metered upstream (api-football) is the most expensive thing the service does. Two patterns keep the call rate sane: caching at multiple layers so the same data isn't fetched twice, and a single rate-limited chokepoint so a busy minute can't blow the budget.

**Minimizing calls:**

- **Two-tier cache.** Raw API responses live in an LRU keyed by `[endpoint]_[remoteId]_[season]`. Mapped domain lists live in a separate cache keyed by **internal UUID** (`domain_fixtures_<uuid>`). Deleting and recreating a league instantly clears the domain cache for that instance without touching the raw cache, so we don't re-pay the upstream call. The two namespaces never collide. ([§3–4](AI_README_FIRST.MD))
- **Status-driven TTLs.** Fixture cache inherits its TTL from match status via `fixtureTTL()` in [cache.service.ts](apps/service/src/services/cache.service.ts): completed=2h, live=5m, stable=30m. Completed matches stay cached 24× longer than live ones. Past seasons freeze to 2h via `seasonTTL()`.
- **Prefix invalidation.** `invalidate('seasons')` removes an entire derived subtree in one pass — no key-list iteration.

**Bounding the budget:**

- **One chokepoint, one budget.** Every provider method routes through a private `ApiFootballProvider.request()` wrapper guarded by a per-instance `Bottleneck`. The first response's `X-RateLimit-Limit` header resizes the reservoir at runtime — Free starts conservative at 10/min, Pro widens to 300/min, no redeploy. Calling `this.client.get(...)` directly silently bypasses the budget; that's the smell. ([docs/provider-integration.md](docs/provider-integration.md))
- **429s never reach callers.** On HTTP 429 the limiter reads `Retry-After`, queues up to 3 retries, and only surfaces the error after all attempts fail.
- **The asset CDN runs on its own budget.** Graphics downloads queue through a module-level `Bottleneck({ maxConcurrent: 10 })` at the consumer in [graphics.service.ts](apps/service/src/services/graphics.service.ts) — concurrency-only, decoupled from the metered API's per-minute reservoir. Same shape, different budget.

### How updates reach users without polling the upstream

The naive design — browser polls api-football every N seconds — doesn't work: it burns through the upstream rate budget, leaks the API key to the client, and saturates bandwidth re-downloading data that didn't change. UltraTable splits the work in two:

- **Server-side background sync** keeps Postgres current with api-football. Match-day live polling is the server's job, not the browser's.
- **Client-side delta-pull** in [useDeltaSync.ts](apps/web/src/hooks/useDeltaSync.ts): the browser sends `since = lastUpdatedAt`, the server returns only rows changed since then, and the result lands in Dexie (IndexedDB). A stale-fixture detector (past-due fixtures still in a non-terminal status) forces a full re-pull when the local view has drifted.

No websockets to operate, no client→upstream calls, no global pulse polling. The browser does the minimum work that produces a fresh table.

### How long imports stay off the 15s GraphQL ceiling

A 20-team season import calls the upstream provider dozens of times. Running that inline blows through the authenticated GraphQL request timeout (15 seconds, structural) before the import finishes. The fix isn't a tuning knob — it's an architectural contract.

- Any mutation whose runtime scales with input dispatches via `JobRunner.runInBackground` and returns a `JobExecution` row immediately.
- The admin polls `jobExecutions` for status; rows carry `processedCount` / `totalCount` / `apiCallsCount` so every import is observable end-to-end.
- The closure-capture pattern (`let result; await JobRunner.run(...); return result`) doesn't survive background execution — that pattern is the smell that something's on the wrong side of the request boundary.
- Job + execution rows are first-class GraphQL entities, so the admin console queries the same surface as the public app — no side-channel. ([docs/workers.md](docs/workers.md))

> [!IMPORTANT]
> Issue [#125](../../issues/125) was a 20-team season import timing out at the 15s ceiling. The root cause was inline execution combined with no rate-limit awareness for the upstream. The fix lives in two contracts working together: long syncs route through the worker pipeline (this section), and every upstream call routes through one rate-limited chokepoint (the API section above).

### How Predictions stay replayable months later

The streamer use case is "make a prediction live on camera, save it, come back next match-week and show the audience how the table actually played out." That requires drafts that survive a refresh, snapshots that don't drift, and a generic mechanism for the variants on the roadmap.

- **Drafts survive a refresh.** Drag-and-drop drafts persist in **Dexie (IndexedDB)** keyed per `(viewer, season, type)`. Refreshing mid-prediction doesn't cost the user their work; switching seasons swaps to a clean draft.
- **Lock-in produces an immutable snapshot.** The history panel re-loads any past snapshot to compare against the current live table — months later, the comparison is exact, not reconstructed.
- **New ranking types are a registration, not a schema migration.** Tier Lists are backed by a `TierRankableType` recipe registry in [tier-lists.ts](apps/service/src/schema/tier-lists.ts) — adding "rank players by goals" plugs in a recipe rather than touching DDL.

### How Graphics avoid duplicates and SSRF

Two distinct problems, both handled in [graphics.service.ts](apps/service/src/services/graphics.service.ts).

- **Content-hash dedup.** Uploaded images are keyed by SHA256, not filename. Identical images from different sources reuse the same blob via upsert on `(entityType, entityId)`. Batch sideloads (`sideloadMissing`) check the graphics table once for existing rows, then fire downloads only for the missing pairs — no per-candidate query.
- **No SSRF.** A URL scheme allow-list (http/https only) gates every download before axios ever opens a socket. `file://`, `gopher://`, and internal-IP URLs are rejected at parse time.
- **Concurrency limiter** caps in-flight downloads independently of the metered API's rate budget (see the previous section).

### How two SPAs avoid becoming a monolith

`apps/admin` and `apps/web` are two products built from the same GraphQL surface. The risk is that they slowly fuse — shared "utils" folders, copied components, cross-app imports. The rules below keep that from happening.

- **Zero source-level coupling.** No cross-app imports. shadcn/ui primitives are installed per app via `npx shadcn add`, never copied between apps. Either SPA can be deployed to a separate container without untangling anything.
- **Components stay small.** The web `App.tsx` is 30 lines; routing fans out to focused page components, which fan out to focused subcomponents (`PredictionHistoryPanel`, `ProjectedFinishBoard`, `SectionNav`, …). No monolithic `App.tsx`.
- **No `any`, zero-warning lint** — enforced in CI for all three workspaces.
- **urql + Dexie split.** urql handles normalized GraphQL caching; Dexie holds the offline-tolerant drafts that GraphQL has no business persisting (see the Predictions section).
- **Tailwind v4 + shadcn theme variables** are the only source of truth for design tokens per app; documented in [docs/frontend-patterns.md](docs/frontend-patterns.md).

### How two products share auth without leaking sessions

Two SPAs on different origins, one backend, one Google Cloud project. The naive setup leaks sessions across origins or forces `SameSite=None` cookies. [docs/auth-architecture.md](docs/auth-architecture.md) is the deep dive; the headline:

- **Each frontend has its own Google OAuth client** (same Google Cloud project, different consent screens, independent revocation). Public client IDs ship in each frontend's bundle as `VITE_GOOGLE_CLIENT_ID`; secrets live only on the service, namespaced `GOOGLE_CLIENT_SECRET_{ADMIN,WEB}`.
- **The service accepts tokens from either client.** Better Auth gets `clientId: [adminId, webId]` (its canonical cross-platform pattern). Tokens whose `aud` matches either are accepted by the same backend.
- **ID-token sign-in flow.** The browser uses Google Identity Services to fetch an ID token under its own client ID, then POSTs it via `authClient.signIn.social({ provider: 'google', idToken: { token } })`. No redirect to Google, no per-host dispatch on the service.
- **Edge rewrites proxy `/api/auth/*`** so the session cookie lives on each SPA's own origin (same-site, no `SameSite=None` gymnastics). `BETTER_AUTH_URL` is intentionally unset in production; Better Auth derives the base URL per request from `X-Forwarded-Host`.
- **CASL rules live in three files by design** (server + both frontends). They're 30 lines of pure data; a shared package would couple browser and Node bundles for no benefit. Drift is the classic "button renders, click 403s" pitfall, called out explicitly in the [PR-review checklist](docs/auth-architecture.md).
- **Identities can't be hijacked by email.** Two-tier model: `auth_user` (one per provider identity) bridges to a domain `user` via `auth_link`. The bootstrap hook in [auth-bootstrap.ts](apps/service/src/services/auth-bootstrap.ts) **never** auto-merges by email — anyone who creates a Google account at your address can't merge into your account.
- **The viewer query never throws.** `Query.viewer` returns `null` when unauthenticated, pinned by [viewer.test.ts](apps/service/src/schema/viewer.test.ts); frontends render the signed-out state without try/catch.

### What survives a backend or provider swap

A portfolio promise that swapping infrastructure is "trivial" usually isn't. Here's the honest split.

- **Database swap: real today.** Resolvers import `{ repository }` from [repositories/](apps/service/src/repositories), typed against an interface; the Postgres backend lives in `repositories/postgres/` as per-domain sub-repos. Adding a second backend is a new folder plus a one-line change at the index file. Resolvers never know.
- **Data-provider swap: half real.** The persistence layer accepts provider-neutral `Ingested*` types from [integrations/types.ts](apps/service/src/integrations/types.ts) — a new provider writes its own normalizer producing the same shapes, and the repos don't care. The unfinished half: schema-layer call sites still reference `ApiFootballProvider` by name. A true second provider would need a `Provider` interface introduced at those sites; the data boundary is the prerequisite, not the whole job.
- **Migration safety doesn't depend on the backend.** Drizzle migrations are the canonical workflow (`db:generate` → commit the SQL → `db:migrate`); `db:push` exists as an escape hatch and `db:bootstrap` is the idempotent rescue path for databases originally set up via push. The rollout for issue [#99](../../issues/99) had to upgrade existing dev DBs without forcing a wipe — the idempotency mattered.
- **Local Docker mirrors prod.** [`docker-compose.yml`](docker-compose.yml) builds the service image the same way Fly does; running `docker compose up --build -d service` periodically catches Dockerfile drift before it reaches a deploy.

### Tested where it matters

- 54 test files across the monorepo; unit + integration via Vitest.
- The load-bearing pieces have dedicated test files: [auth-bootstrap.test.ts](apps/service/src/services/auth-bootstrap.test.ts), [cache-invalidation.test.ts](apps/service/src/schema/cache-invalidation.test.ts), [rbac.test.ts](apps/service/src/schema/rbac.test.ts), [schema-descriptions.test.ts](apps/service/src/schema/schema-descriptions.test.ts) (asserts every GraphQL field has a description), [viewer.test.ts](apps/service/src/schema/viewer.test.ts), [predictions.test.ts](apps/service/src/schema/predictions.test.ts), [tier-lists.test.ts](apps/service/src/schema/tier-lists.test.ts).
- Frontend tests use `@testing-library/react` + `fake-indexeddb` so the Dexie-backed prediction drafts get real coverage, not mocks.

---

## Built with AI agents as a force multiplier

This codebase was built by one engineer (me) collaborating with AI coding agents. The agents move fast; my job is to make sure they move fast *in the right direction*. Two artifacts make that possible:

- **[AI_README_FIRST.MD](AI_README_FIRST.MD)** — the architectural rules above, written for an agent who joined the project five seconds ago. Naming conventions, ID rules, timestamp rules, hybrid-schema rules, DataLoader rule, CASL rule, the bootstrap-hook security pitfall, the `/tmp/` rule for utility scripts. Agents read it before touching the schema or the data layer.
- **[CLAUDE.md](CLAUDE.md)** — the operating manual: what to run, where things live, when to re-run `npm run setup` instead of hand-editing `.env`, the never-`pkill` rule. Pure conventions, no architecture.

The result is that an agent picking up a ticket inherits the same constraints a senior teammate would. The dual-ID rule, the DataLoader rule, the "never auto-link by email" rule — none of them have to be re-litigated per PR. **The architectural decisions amortize across every future change**, whether the change is mine or an agent's.

What this enables, concretely: the [recent commit history](../../commits/master) shows multi-PR feature stacks (Predictions, Tier Lists) shipping with their own schema, repository, GraphQL surface, role gates, and UI in a fraction of the calendar time a one-engineer team would normally produce. Every PR still goes through lint + tests + a real review pass — agents accelerate the work, they don't bypass the bar.

---

## Roadmap

- **Stream Overlays** — the monetization wedge. Thin, low-latency overlay renderers that read from the existing GraphQL surface and render a chroma-key-friendly view of a Prediction or Tier List for OBS / Streamlabs. The data layer is already designed for it (Prediction snapshots are immutable; the standings cache is keyed for instant invalidation).
- **More ranking types.** The `TierRankableType` registry is set up to add players, fixtures, and arbitrary domain entities without schema migrations.
- **Database RLS facade.** Currently Drizzle bypasses Supabase RLS because the service connects as a superuser. Plan documented in [docs/DEPLOYMENT.md § Future Hardening](docs/DEPLOYMENT.md).
- **Per-club tenancy.** Clubs onboarding their own stats surface will need org-scoped CASL rules and a tenancy column on the relevant tables. The CASL pattern is already in place; the work is mechanical.

---

## Run it locally / deploy it

- **Local development** — see [docs/getting-started.md](docs/getting-started.md). One command (`npm run setup`) provisions everything; `npm run dev` starts all three services.
- **Deployment to Fly.io + Vercel** — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Auth architecture** — see [docs/auth-architecture.md](docs/auth-architecture.md).
- **Frontend patterns** (shadcn theme contract, vendoring rule) — see [docs/frontend-patterns.md](docs/frontend-patterns.md).
- **Agent-facing architectural contracts** — see [AI_README_FIRST.MD](AI_README_FIRST.MD).

```bash
# TL;DR
npm run setup    # prompts for ports + Postgres mode + API key, writes .env files
npm run dev      # starts service + admin + web (defaults: 8080 / 5174 / 5175)
```

Local URLs (defaults): [Web](http://localhost:5175) · [Admin](http://localhost:5174) · [GraphQL Playground](http://localhost:8080/graphql) · [Health](http://localhost:8080/healthz). Override the ports by re-running `npm run setup` (or by editing `SERVICE_PORT` / `ADMIN_PORT` / `WEB_PORT` in the root `.env`).

---

**Contact:** pdxgeek@gmail.com — for commercial licensing or to talk about hiring me.
