/**
 * Predictions repository — integration coverage (issue #105).
 *
 * Hits the local Postgres (the `ultratable-postgres-1` container configured
 * via `DATABASE_URL`). Run via `npm run test:integration --workspace apps/service`.
 *
 * Scope:
 *   - Snapshot insert + entry insert in one transaction
 *   - Soft-delete sets `deletedAt`; live listings hide deleted rows
 *   - `includeDeleted` surfaces deleted rows for admin paths
 *   - Idempotent soft-delete (re-issue returns the same id, doesn't 500)
 *   - Cap counts include soft-deleted rows
 *   - User-row cascade nukes snapshots + entries
 *   - Snapshot-cascade nukes entries
 *   - `countGameweeksInSeason` returns distinct gameweeks from fixtures
 *
 * Isolation: every row is scoped to test users / test leagues created
 * inside the suite; we never touch real data.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../db';
import * as schema from '../db/schema';
import { repository } from '.';

const TEST_SOURCE = 'test-predictions-integration';
const TEST_SOURCE_ID_BASE = 9_910_000;

interface PredictionScaffold {
    user: typeof schema.users.$inferSelect;
    league: typeof schema.leagues.$inferSelect;
    season: typeof schema.seasons.$inferSelect;
    teamA: typeof schema.teams.$inferSelect;
    teamB: typeof schema.teams.$inferSelect;
    teamC: typeof schema.teams.$inferSelect;
}

async function deleteTestRows() {
    // Snapshots cascade to entries; user cascade also nukes the snapshot row.
    // Wipe explicitly to keep cleanup order independent of any in-flight FK
    // behaviour.
    await db.delete(schema.predictionSnapshotEntries).where(sql`
        snapshot_id IN (
          SELECT ps.id FROM prediction_snapshots ps
          INNER JOIN "user" u ON ps.user_id = u.id
          WHERE u.email LIKE 'predictions-it-%@test.local'
        )
    `);
    await db.delete(schema.predictionSnapshots).where(sql`
        user_id IN (SELECT u.id FROM "user" u WHERE u.email LIKE 'predictions-it-%@test.local')
    `);
    await db.delete(schema.fixtures).where(eq(schema.fixtures.sourceName, TEST_SOURCE));
    await db
        .delete(schema.seasonsToTeams)
        .where(sql`team_id IN (SELECT id FROM teams WHERE source_name = ${TEST_SOURCE})`);
    await db
        .delete(schema.seasons)
        .where(sql`league_id IN (SELECT id FROM leagues WHERE source_name = ${TEST_SOURCE})`);
    await db.delete(schema.teams).where(eq(schema.teams.sourceName, TEST_SOURCE));
    await db.delete(schema.leagues).where(eq(schema.leagues.sourceName, TEST_SOURCE));
    await db.delete(schema.users).where(sql`email LIKE 'predictions-it-%@test.local'`);
}

async function buildScaffold(suffix: number): Promise<PredictionScaffold> {
    // Stride by 100 so per-scaffold team source ids never overlap.
    const base = TEST_SOURCE_ID_BASE + suffix * 100;

    const [user] = await db
        .insert(schema.users)
        .values({
            name: `Predictions IT ${suffix}`,
            email: `predictions-it-${suffix}@test.local`,
        })
        .returning();

    const [league] = await db
        .insert(schema.leagues)
        .values({
            name: `IT Predictions League ${base}`,
            slug: `it-predictions-${base}`,
            sourceName: TEST_SOURCE,
            sourceId: base,
        })
        .returning();

    const [season] = await db
        .insert(schema.seasons)
        .values({ leagueId: league.id, year: 9000 + suffix })
        .returning();

    const teams: (typeof schema.teams.$inferSelect)[] = [];
    for (let i = 0; i < 3; i += 1) {
        const [team] = await db
            .insert(schema.teams)
            .values({
                name: `IT Predictions Team ${base}-${i}`,
                sourceName: TEST_SOURCE,
                sourceId: base + 10 + i,
            })
            .returning();
        teams.push(team);
        await db
            .insert(schema.seasonsToTeams)
            .values({ seasonId: season.id, teamId: team.id });
    }

    return {
        user,
        league,
        season,
        teamA: teams[0],
        teamB: teams[1],
        teamC: teams[2],
    };
}

describe('PostgresPredictionsRepository — integration', () => {
    beforeAll(async () => {
        expect(db, 'DATABASE_URL must be configured to run integration tests').toBeTruthy();
        await deleteTestRows();
    });

    afterAll(async () => {
        await deleteTestRows();
    });

    it('createSnapshot persists snapshot + entries atomically', async () => {
        const s = await buildScaffold(1);
        const snapshot = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [
                { teamId: s.teamA.id, position: 1 },
                { teamId: s.teamB.id, position: 2 },
                { teamId: s.teamC.id, position: 3 },
            ],
        });
        expect(snapshot.userId).toBe(s.user.id);
        expect(snapshot.deletedAt).toBeNull();

        const entries = await repository.predictions.listSnapshotEntries(snapshot.id);
        expect(entries).toEqual([
            { teamId: s.teamA.id, position: 1 },
            { teamId: s.teamB.id, position: 2 },
            { teamId: s.teamC.id, position: 3 },
        ]);
    });

    it('listSnapshots filters soft-deleted rows by default; includeDeleted surfaces them', async () => {
        const s = await buildScaffold(2);
        const a = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [{ teamId: s.teamA.id, position: 1 }],
        });
        const b = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [{ teamId: s.teamB.id, position: 1 }],
        });
        await repository.predictions.softDeleteSnapshot(a.id);

        const live = await repository.predictions.listSnapshots({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
        });
        expect(live.map((r) => r.id)).toEqual([b.id]);

        const all = await repository.predictions.listSnapshots({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            includeDeleted: true,
        });
        expect(all.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('getSnapshotById hides soft-deleted rows by default', async () => {
        const s = await buildScaffold(3);
        const created = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [{ teamId: s.teamA.id, position: 1 }],
        });
        await repository.predictions.softDeleteSnapshot(created.id);

        expect(await repository.predictions.getSnapshotById({ id: created.id })).toBeNull();

        const withDeleted = await repository.predictions.getSnapshotById({
            id: created.id,
            includeDeleted: true,
        });
        expect(withDeleted?.deletedAt).toBeTruthy();
    });

    it('softDeleteSnapshot is idempotent (returns id on re-issue) and null for unknown ids', async () => {
        const s = await buildScaffold(4);
        const snap = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [{ teamId: s.teamA.id, position: 1 }],
        });
        expect(await repository.predictions.softDeleteSnapshot(snap.id)).toBe(snap.id);
        expect(await repository.predictions.softDeleteSnapshot(snap.id)).toBe(snap.id);

        expect(
            await repository.predictions.softDeleteSnapshot(
                '00000000-0000-0000-0000-000000000000',
            ),
        ).toBeNull();
    });

    it('countSnapshotsInScope counts every row including soft-deleted (cap-spam guard)', async () => {
        const s = await buildScaffold(5);
        const make = () =>
            repository.predictions.createSnapshot({
                userId: s.user.id,
                seasonId: s.season.id,
                type: 'projected_finish',
                entries: [{ teamId: s.teamA.id, position: 1 }],
            });
        const a = await make();
        await make();
        await repository.predictions.softDeleteSnapshot(a.id);

        const count = await repository.predictions.countSnapshotsInScope({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
        });
        expect(count).toBe(2);
    });

    it('cascades: deleting the user nukes their snapshots and entries', async () => {
        const s = await buildScaffold(6);
        const snap = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [
                { teamId: s.teamA.id, position: 1 },
                { teamId: s.teamB.id, position: 2 },
            ],
        });

        await db.delete(schema.users).where(eq(schema.users.id, s.user.id));

        const snapRows = await db
            .select()
            .from(schema.predictionSnapshots)
            .where(eq(schema.predictionSnapshots.id, snap.id));
        expect(snapRows).toEqual([]);

        const entryRows = await db
            .select()
            .from(schema.predictionSnapshotEntries)
            .where(eq(schema.predictionSnapshotEntries.snapshotId, snap.id));
        expect(entryRows).toEqual([]);
    });

    it('countGameweeksInSeason returns distinct gameweek count from fixtures', async () => {
        const s = await buildScaffold(7);
        const baseId = TEST_SOURCE_ID_BASE + 7 * 1000;
        await db.insert(schema.fixtures).values([
            {
                leagueId: s.league.id,
                seasonId: s.season.id,
                homeTeamId: s.teamA.id,
                awayTeamId: s.teamB.id,
                scheduledAt: new Date(),
                sourceName: TEST_SOURCE,
                sourceId: baseId + 1,
                gameweek: 1,
            },
            {
                leagueId: s.league.id,
                seasonId: s.season.id,
                homeTeamId: s.teamB.id,
                awayTeamId: s.teamC.id,
                scheduledAt: new Date(),
                sourceName: TEST_SOURCE,
                sourceId: baseId + 2,
                gameweek: 1,
            },
            {
                leagueId: s.league.id,
                seasonId: s.season.id,
                homeTeamId: s.teamC.id,
                awayTeamId: s.teamA.id,
                scheduledAt: new Date(),
                sourceName: TEST_SOURCE,
                sourceId: baseId + 3,
                gameweek: 2,
            },
        ]);
        expect(await repository.predictions.countGameweeksInSeason(s.season.id)).toBe(2);
    });

    it('listSnapshotEntriesByIds batches entries for DataLoader', async () => {
        const s = await buildScaffold(8);
        const a = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [{ teamId: s.teamA.id, position: 1 }],
        });
        const b = await repository.predictions.createSnapshot({
            userId: s.user.id,
            seasonId: s.season.id,
            type: 'projected_finish',
            entries: [
                { teamId: s.teamB.id, position: 1 },
                { teamId: s.teamC.id, position: 2 },
            ],
        });
        const map = await repository.predictions.listSnapshotEntriesByIds([a.id, b.id]);
        expect(map.get(a.id)).toEqual([{ teamId: s.teamA.id, position: 1 }]);
        expect(map.get(b.id)).toEqual([
            { teamId: s.teamB.id, position: 1 },
            { teamId: s.teamC.id, position: 2 },
        ]);
    });
});
