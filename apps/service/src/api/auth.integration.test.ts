/**
 * Integration coverage for Better Auth + admin-plugin schema alignment.
 *
 * Bugs this test catches:
 *   - A new column is added to the drizzle schema (e.g. `auth_session.impersonatedBy`
 *     when the admin plugin is registered) but the corresponding migration
 *     has not been applied to the live database. Better Auth's internal
 *     session-fetch query selects every mapped column on every call, so a
 *     missing column produces an immediate `column "X" does not exist` crash
 *     the first time any GraphQL request touches `auth.api.getSession`.
 *
 * Hits the real Postgres configured via `DATABASE_URL` — run with
 * `npm run test:integration --prefix apps/service`. Not part of the unit
 * suite.
 *
 * The test calls `auth.api.getSession` with an empty header set. That path
 * resolves to "no session → null" without ever needing a real session row,
 * but it executes the underlying SELECT against `auth_session` joined to
 * `auth_user` — exactly the surface where missing columns surface. The
 * assertion is simply "this didn't throw" plus a nullish return.
 *
 * Belt-and-suspenders: a column-existence check runs a `SELECT col, … LIMIT 0`
 * against the columns the admin plugin requires. `LIMIT 0` makes it free at
 * runtime; the planner still validates the column list, so a missing column
 * fails the query the same way a real read would.
 */
import { describe, expect, it } from 'vitest';

import { db } from '../db';
import * as schema from '../db/schema';
import { auth } from './auth';

describe('Better Auth schema alignment', () => {
    it('auth.api.getSession runs without column-not-found errors', async () => {
        expect(db, 'DATABASE_URL must be set to run integration tests').toBeTruthy();
        // Empty headers → no cookie → Better Auth returns null. The point is
        // not the return value but that the query underneath executes — if
        // the migrations are behind, we get the same `column "impersonated_by"
        // does not exist` crash that bit us in dev.
        const session = await auth.api.getSession({ headers: new Headers() });
        expect(session).toBeNull();
    });

    it('every admin-plugin column exists on auth_session', async () => {
        if (!db) return;
        await db
            .select({
                id: schema.authSessions.id,
                userId: schema.authSessions.userId,
                impersonatedBy: schema.authSessions.impersonatedBy,
            })
            .from(schema.authSessions)
            .limit(0);
    });

    it('every admin-plugin column exists on auth_user', async () => {
        if (!db) return;
        await db
            .select({
                id: schema.authUsers.id,
                role: schema.authUsers.role,
                banned: schema.authUsers.banned,
                banReason: schema.authUsers.banReason,
                banExpires: schema.authUsers.banExpires,
            })
            .from(schema.authUsers)
            .limit(0);
    });
});
