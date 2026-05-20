# Performance Registry

Known performance issues, mitigations, and future optimization opportunities.

---

## 1. GraphQL N+1 Queries in Fixture & Team Resolvers

**Status:** ✅ Resolved — DataLoader batching landed 2026-05-20  
**Severity:** Medium (latent — only triggered on custom/admin queries)  
**Filed:** 2026-03-03  
**Implementation:** `apps/service/src/loaders/index.ts`; resolvers in `apps/service/src/schema/football.ts` (`Team.venue`, `Fixture.{homeTeam,awayTeam,venue,season,leagueSourceId}`) now call `ctx.loaders.*.load(id)`.

### Problem

The GraphQL schema defines nested object resolvers on `Fixture` and `Team` types that each execute an **individual SQL query per parent row**:

```
Fixture.homeTeam  → SELECT * FROM teams WHERE id = ?    (per fixture)
Fixture.awayTeam  → SELECT * FROM teams WHERE id = ?    (per fixture)
Fixture.venue     → SELECT * FROM venues WHERE id = ?   (per fixture)
Fixture.season    → SELECT * FROM seasons WHERE id = ?  (per fixture)
Team.venue        → SELECT * FROM venues WHERE id = ?   (per team)
```

For a full Premier League season (380 fixtures, 20 teams), a query requesting nested objects produces:

| Resolver | Queries per fixture | Total (380 fixtures) |
|----------|--------------------:|---------------------:|
| `homeTeam` | 1 | 380 |
| `awayTeam` | 1 | 380 |
| `venue` | 1 | 380 |
| `season` | 1 | 380 |
| `leagueSourceId` | 2 | 760 |
| **Total** | | **~2,280 queries** |

Similarly, `Team.venue` adds 1 query per team (20 extra for a season listing).

### What Triggers It (and What Doesn't)

**No current user-facing scenario triggers this today.** Neither the web app nor the admin dashboard sends a query that requests nested objects on fixture lists. They all use scalar ID fields (`homeTeamId`, `awayTeamId`, `venueId`) and resolve names client-side from the local Dexie cache.

The N+1 only fires if someone manually crafts a query requesting nested objects — e.g., in a GraphQL playground:

```graphql
# This triggers ~1,140 individual SQL queries:
query {
  fixtures(leagueId: 39, season: 2024) {
    id
    homeTeam { name logo }   # ← 380 individual team queries
    awayTeam { name logo }   # ← 380 more
    venue { name city }      # ← 380 more
  }
}
```

It would become a real problem if a future feature (match detail page, public API, admin fixture browser) requests nested team/venue objects on a fixture list.

### Current Mitigation

The web app's primary data-fetching query (`SYNC_DATA_QUERY` in `apps/web/src/api/queries.ts`) **only requests scalar fields** — it never asks for nested `homeTeam`, `awayTeam`, `venue`, or `season` sub-objects:

```graphql
# apps/web/src/api/queries.ts — SYNC_DATA_QUERY
query SyncData($leagueId: Int!, $season: Int!, $since: DateTime) {
  fixtures(leagueId: $leagueId, season: $season, since: $since) {
    id
    seasonId
    homeTeamId    # ← scalar ID, not nested object
    awayTeamId    # ← scalar ID, not nested object
    venueId       # ← scalar ID, not nested object
    scheduledAt
    status
    goalsHome
    goalsAway
    gameweek
    updatedAt
  }
}
```

Because GraphQL only executes resolvers for **requested fields**, the N+1 resolvers never fire on this hot path. The nested resolvers only trigger when:

- An admin query in the admin dashboard requests nested fields
- A developer writes a custom query during debugging
- Future features request nested fixture data

Warning comments have been added to the affected resolvers in `apps/service/src/schema/football.ts`.

### Recommended Fix: DataLoader Pattern

The standard solution is [DataLoader](https://github.com/graphql/dataloader) — a per-request batching utility that collects individual `.load(id)` calls within a single event-loop tick and executes them as a single `SELECT * FROM teams WHERE id IN (...)` query.

#### Implementation Steps

1. **Install dependency:**
   ```bash
   npm install dataloader --workspace=apps/service
   ```

2. **Create loader factory** (`apps/service/src/loaders/index.ts`):
   ```typescript
   import DataLoader from 'dataloader';
   import { db } from '../db';
   import * as schema from '../db/schema';
   import { inArray } from 'drizzle-orm';

   export function createLoaders() {
     return {
       teamLoader: new DataLoader<string, typeof schema.teams.$inferSelect | null>(
         async (ids) => {
           const rows = await db.select().from(schema.teams)
             .where(inArray(schema.teams.id, [...ids]));
           const map = new Map(rows.map(r => [r.id, r]));
           return ids.map(id => map.get(id) ?? null);
         }
       ),
       venueLoader: new DataLoader<string, typeof schema.venues.$inferSelect | null>(
         async (ids) => {
           const rows = await db.select().from(schema.venues)
             .where(inArray(schema.venues.id, [...ids]));
           const map = new Map(rows.map(r => [r.id, r]));
           return ids.map(id => map.get(id) ?? null);
         }
       ),
       seasonLoader: new DataLoader<string, typeof schema.seasons.$inferSelect | null>(
         async (ids) => {
           const rows = await db.select().from(schema.seasons)
             .where(inArray(schema.seasons.id, [...ids]));
           const map = new Map(rows.map(r => [r.id, r]));
           return ids.map(id => map.get(id) ?? null);
         }
       ),
     };
   }

   export type Loaders = ReturnType<typeof createLoaders>;
   ```

3. **Add loaders to GraphQL context** (`apps/service/src/index.ts`):
   ```typescript
   import { createLoaders } from './loaders';

   // In the Yoga context factory:
   context: async ({ request }) => ({
     req: request,
     loaders: createLoaders(),  // fresh per request — no cross-request caching
     user: /* ... existing user resolution ... */
   })
   ```

4. **Update Context type** (`apps/service/src/schema/builder.ts`):
   ```typescript
   import type { Loaders } from '../loaders';

   export interface Context {
     req: FastifyRequest;
     reply?: FastifyReply;
     user?: { id: string; roles: string[] };
     loaders: Loaders;
   }
   ```

5. **Replace individual queries in resolvers** (`apps/service/src/schema/football.ts`):
   ```typescript
   // Before (N+1):
   homeTeam: t.field({
     type: TeamRef,
     resolve: async (parent) => {
       const [t] = await db.select().from(schema.teams)
         .where(eq(schema.teams.id, parent.homeTeamId));
       return t;
     }
   })

   // After (batched):
   homeTeam: t.field({
     type: TeamRef,
     resolve: (parent, _args, ctx) =>
       ctx.loaders.teamLoader.load(parent.homeTeamId)
   })
   ```

#### Expected Result

| Scenario | Before | After |
|----------|-------:|------:|
| 380 fixtures with nested teams + venue | ~2,280 queries | ~3 queries |
| 20 teams with venue | ~20 queries | ~1 query |

#### Effort Estimate

~30–45 minutes including tests. The changes are mechanical — create the loader module, wire into context, update ~6 resolvers.
