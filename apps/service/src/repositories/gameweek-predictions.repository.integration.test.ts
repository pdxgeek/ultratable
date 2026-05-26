/**
 * Gameweek-predictions repository — integration coverage (issue #144).
 *
 * Hits the local Postgres (the `ultratable-postgres-1` container configured
 * via `DATABASE_URL`). Run via `npm run test:integration --workspace apps/service`.
 *
 * Scope (repository contract only — resolver-layer concerns like CASL,
 * GAMEWEEK_CLOSED, fixture-status guards, and INVALID_MANUAL_ADD live
 * with their resolver test file):
 *   - Lazy container creation on first submit
 *   - Container reuse on subsequent submits (same scope)
 *   - Pick dedup against the latest row (identical → no insert, no bump)
 *   - New row inserted when any pick field differs; container `updatedAt` bumped
 *   - One-live-per-(user, season, gameweek) partial unique enforced
 *   - Soft-delete + resubmit creates a FRESH container (no auto un-soft-delete)
 *   - Soft-delete is idempotent and returns null for unknown ids
 *   - `listCurrentPicks` returns latest per fixture; `listPickHistory` returns the whole chain
 *   - DataLoader batched variants honour empty buckets for unknown ids
 *   - User-row cascade nukes the container + its pick chain
 *   - Fixture helpers: by-gameweek, recommended rescheduled-window, selectable, active
 *
 * Isolation: every row is scoped to test users / test leagues created
 * inside the suite; we never touch real data.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../db';
import * as schema from '../db/schema';
import { repository } from '.';

const TEST_SOURCE = 'test-gameweek-predictions-integration';
const TEST_SOURCE_ID_BASE = 9_920_000;

interface Scaffold {
    user: typeof schema.users.$inferSelect;
    league: typeof schema.leagues.$inferSelect;
    season: typeof schema.seasons.$inferSelect;
    teamA: typeof schema.teams.$inferSelect;
    teamB: typeof schema.teams.$inferSelect;
    // Fixtures map: { 'gw1-a': Fixture, 'gw1-b': Fixture, ... }
    fixtures: Record<string, typeof schema.fixtures.$inferSelect>;
}

async function deleteTestRows() {
    // Picks cascade with the container; container cascades with the user.
    // Wipe explicitly to keep cleanup order deterministic regardless of
    // in-flight FK behaviour.
    await db.delete(schema.gameweekPredictionPicks).where(sql`
        prediction_id IN (
          SELECT gp.id FROM gameweek_predictions gp
          INNER JOIN "user" u ON gp.user_id = u.id
          WHERE u.email LIKE 'gw-predictions-it-%@test.local'
        )
    `);
    await db.delete(schema.gameweekPredictions).where(sql`
        user_id IN (SELECT u.id FROM "user" u WHERE u.email LIKE 'gw-predictions-it-%@test.local')
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
    await db.delete(schema.users).where(sql`email LIKE 'gw-predictions-it-%@test.local'`);
}

/**
 * Builds a season with two teams and a small set of fixtures across
 * three numbered gameweeks plus one mid-week rescheduled cup tie. The
 * shape is shared by every test to keep setup compact; tests that need
 * a different distribution (e.g. all played, no scheduled) create their
 * own fixtures inline against the same scaffold.
 */
async function buildScaffold(suffix: number): Promise<Scaffold> {
    const base = TEST_SOURCE_ID_BASE + suffix * 100;

    const [user] = await db
        .insert(schema.users)
        .values({
            name: `GW Predictions IT ${suffix}`,
            email: `gw-predictions-it-${suffix}@test.local`,
        })
        .returning();

    const [league] = await db
        .insert(schema.leagues)
        .values({
            name: `IT GW Predictions League ${base}`,
            slug: `it-gw-predictions-${base}`,
            sourceName: TEST_SOURCE,
            sourceId: base,
        })
        .returning();

    const [season] = await db
        .insert(schema.seasons)
        .values({ leagueId: league.id, year: 9100 + suffix })
        .returning();

    const teams: (typeof schema.teams.$inferSelect)[] = [];
    for (let i = 0; i < 2; i += 1) {
        const [team] = await db
            .insert(schema.teams)
            .values({
                name: `IT GW Team ${base}-${i}`,
                sourceName: TEST_SOURCE,
                sourceId: base + 10 + i,
            })
            .returning();
        teams.push(team);
        await db
            .insert(schema.seasonsToTeams)
            .values({ seasonId: season.id, teamId: team.id });
    }

    // Three gameweeks of one fixture each + a cup tie between GW1 and GW2.
    //   GW1   2024-08-10  (scheduled)
    //   CUP   2024-08-14  (scheduled) ← rescheduled-window for GW1↔GW2
    //   GW2   2024-08-17  (scheduled)
    //   GW3   2024-08-24  (played)    ← no longer selectable
    const fixtureSeeds: Array<{
        key: string;
        gameweek: number | null;
        scheduledAt: string;
        status: typeof schema.fixtures.$inferInsert.status;
        sourceOffset: number;
    }> = [
        { key: 'gw1', gameweek: 1, scheduledAt: '2024-08-10T15:00:00Z', status: 'scheduled', sourceOffset: 20 },
        { key: 'cup', gameweek: null, scheduledAt: '2024-08-14T19:00:00Z', status: 'scheduled', sourceOffset: 21 },
        { key: 'gw2', gameweek: 2, scheduledAt: '2024-08-17T15:00:00Z', status: 'scheduled', sourceOffset: 22 },
        { key: 'gw3', gameweek: 3, scheduledAt: '2024-08-24T15:00:00Z', status: 'played', sourceOffset: 23 },
    ];
    const fixtures: Record<string, typeof schema.fixtures.$inferSelect> = {};
    for (const seed of fixtureSeeds) {
        const [row] = await db
            .insert(schema.fixtures)
            .values({
                leagueId: league.id,
                seasonId: season.id,
                homeTeamId: teams[0].id,
                awayTeamId: teams[1].id,
                status: seed.status,
                scheduledAt: new Date(seed.scheduledAt),
                gameweek: seed.gameweek,
                sourceName: TEST_SOURCE,
                sourceId: base + seed.sourceOffset,
            })
            .returning();
        fixtures[seed.key] = row;
    }

    return {
        user,
        league,
        season,
        teamA: teams[0],
        teamB: teams[1],
        fixtures,
    };
}

describe('PostgresGameweekPredictionsRepository — integration', () => {
    beforeAll(async () => {
        expect(db, 'DATABASE_URL must be configured to run integration tests').toBeTruthy();
        await deleteTestRows();
    });

    afterAll(async () => {
        await deleteTestRows();
    });

    it('first submitPick lazily creates the container', async () => {
        const s = await buildScaffold(1);
        // Verify nothing pre-existed for the scope.
        const before = await repository.gameweekPredictions.getPredictionForWeek({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
        });
        expect(before).toBeNull();

        const result = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 2,
            awayGoals: 1,
            note: null,
            manuallyAdded: false,
        });
        expect(result.deduped).toBe(false);
        expect(result.prediction.gameweek).toBe(1);
        expect(result.pick.homeGoals).toBe(2);

        const after = await repository.gameweekPredictions.getPredictionForWeek({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
        });
        expect(after?.id).toBe(result.prediction.id);
    });

    it('subsequent submitPick reuses the container; dedup skips identical re-submit', async () => {
        const s = await buildScaffold(2);
        const first = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 2,
            awayGoals: 1,
            note: 'rivalry derby',
            manuallyAdded: false,
        });

        // Re-submit identical payload → no new row, no updatedAt bump.
        const dedup = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 2,
            awayGoals: 1,
            note: 'rivalry derby',
            manuallyAdded: false,
        });
        expect(dedup.deduped).toBe(true);
        expect(dedup.prediction.id).toBe(first.prediction.id);
        expect(dedup.pick.id).toBe(first.pick.id);
        expect(dedup.prediction.updatedAt.getTime()).toBe(first.prediction.updatedAt.getTime());
    });

    it('a different pick value inserts a new row and bumps container updatedAt', async () => {
        const s = await buildScaffold(3);
        const first = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 2,
            awayGoals: 1,
            note: null,
            manuallyAdded: false,
        });
        // Sleep 5ms so the updatedAt difference is observable at millisecond
        // precision (we use date_trunc('milliseconds', now()) server-side).
        await new Promise((r) => setTimeout(r, 5));

        const second = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 3,
            awayGoals: 1,
            note: null,
            manuallyAdded: false,
        });
        expect(second.deduped).toBe(false);
        expect(second.pick.id).not.toBe(first.pick.id);
        expect(second.prediction.id).toBe(first.prediction.id);
        expect(second.prediction.updatedAt.getTime()).toBeGreaterThan(
            first.prediction.updatedAt.getTime(),
        );

        // Note difference alone also counts as a change.
        const third = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 3,
            awayGoals: 1,
            note: 'changed mind on the keeper',
            manuallyAdded: false,
        });
        expect(third.deduped).toBe(false);
        expect(third.pick.id).not.toBe(second.pick.id);

        const history = await repository.gameweekPredictions.listPickHistory(first.prediction.id);
        // Newest first: 3rd → 2nd → 1st.
        expect(history.map((p) => p.id)).toEqual([third.pick.id, second.pick.id, first.pick.id]);
    });

    it('listCurrentPicks returns only the latest row per fixture', async () => {
        const s = await buildScaffold(4);
        await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 1,
            awayGoals: 0,
            note: null,
            manuallyAdded: false,
        });
        await new Promise((r) => setTimeout(r, 5));
        const latestGw1 = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 2,
            awayGoals: 2,
            note: null,
            manuallyAdded: false,
        });
        const manualCup = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.cup.id,
            homeGoals: 0,
            awayGoals: 3,
            note: 'cup upset',
            manuallyAdded: true,
        });

        const current = await repository.gameweekPredictions.listCurrentPicks(
            latestGw1.prediction.id,
        );
        const byFixture = new Map(current.map((p) => [p.fixtureId, p]));
        expect(byFixture.size).toBe(2);
        expect(byFixture.get(s.fixtures.gw1.id)?.id).toBe(latestGw1.pick.id);
        expect(byFixture.get(s.fixtures.cup.id)?.id).toBe(manualCup.pick.id);
        expect(byFixture.get(s.fixtures.cup.id)?.manuallyAdded).toBe(true);
    });

    it('DataLoader batches honour empty buckets for unknown ids', async () => {
        const s = await buildScaffold(5);
        const pred = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 1,
            awayGoals: 1,
            note: null,
            manuallyAdded: false,
        });
        const unknownId = '00000000-0000-0000-0000-000000000000';

        const current = await repository.gameweekPredictions.listCurrentPicksByPredictionIds([
            pred.prediction.id,
            unknownId,
        ]);
        expect(current.get(pred.prediction.id)).toHaveLength(1);
        expect(current.get(unknownId)).toEqual([]);

        const history = await repository.gameweekPredictions.listPickHistoryByPredictionIds([
            pred.prediction.id,
            unknownId,
        ]);
        expect(history.get(pred.prediction.id)).toHaveLength(1);
        expect(history.get(unknownId)).toEqual([]);
    });

    it('partial unique enforces one live slip per (user, season, gameweek)', async () => {
        const s = await buildScaffold(6);
        // First submit creates the container — the partial unique is what
        // would catch a concurrent second INSERT. Mock the race by
        // attempting a direct insert that ignores the live container.
        await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 1,
            awayGoals: 0,
            note: null,
            manuallyAdded: false,
        });
        await expect(
            db.insert(schema.gameweekPredictions).values({
                userId: s.user.id,
                seasonId: s.season.id,
                gameweek: 1,
            }),
        ).rejects.toThrow();
    });

    it('soft-delete is idempotent; resubmit creates a FRESH container (no un-soft-delete)', async () => {
        const s = await buildScaffold(7);
        const first = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 1,
            awayGoals: 0,
            note: null,
            manuallyAdded: false,
        });
        expect(
            await repository.gameweekPredictions.softDeletePrediction(first.prediction.id),
        ).toBe(first.prediction.id);
        // Re-issue is idempotent — returns the same id, no throw.
        expect(
            await repository.gameweekPredictions.softDeletePrediction(first.prediction.id),
        ).toBe(first.prediction.id);
        expect(
            await repository.gameweekPredictions.softDeletePrediction(
                '00000000-0000-0000-0000-000000000000',
            ),
        ).toBeNull();

        // After soft-delete, the same scope is free — a new submit creates a
        // FRESH container, not an un-soft-delete of the old one.
        const reborn = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 2,
            awayGoals: 0,
            note: null,
            manuallyAdded: false,
        });
        expect(reborn.prediction.id).not.toBe(first.prediction.id);
        expect(reborn.prediction.deletedAt).toBeNull();
    });

    it('listPredictionsForUser hides soft-deleted by default; includeDeleted surfaces them', async () => {
        const s = await buildScaffold(8);
        const a = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 1,
            awayGoals: 0,
            note: null,
            manuallyAdded: false,
        });
        const b = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 2,
            fixtureId: s.fixtures.gw2.id,
            homeGoals: 0,
            awayGoals: 3,
            note: null,
            manuallyAdded: false,
        });
        await repository.gameweekPredictions.softDeletePrediction(a.prediction.id);

        const live = await repository.gameweekPredictions.listPredictionsForUser({
            userId: s.user.id,
            seasonId: s.season.id,
        });
        expect(live.map((r) => r.id)).toEqual([b.prediction.id]);

        const all = await repository.gameweekPredictions.listPredictionsForUser({
            userId: s.user.id,
            seasonId: s.season.id,
            includeDeleted: true,
        });
        expect(all.map((r) => r.id).sort()).toEqual(
            [a.prediction.id, b.prediction.id].sort(),
        );
    });

    it('user-row cascade nukes the container and its pick chain', async () => {
        const s = await buildScaffold(9);
        const pred = await repository.gameweekPredictions.submitPick({
            userId: s.user.id,
            seasonId: s.season.id,
            gameweek: 1,
            fixtureId: s.fixtures.gw1.id,
            homeGoals: 1,
            awayGoals: 0,
            note: null,
            manuallyAdded: false,
        });

        await db.delete(schema.users).where(eq(schema.users.id, s.user.id));

        const containerAfter = await db
            .select({ id: schema.gameweekPredictions.id })
            .from(schema.gameweekPredictions)
            .where(eq(schema.gameweekPredictions.id, pred.prediction.id));
        expect(containerAfter).toEqual([]);

        const picksAfter = await db
            .select({ id: schema.gameweekPredictionPicks.id })
            .from(schema.gameweekPredictionPicks)
            .where(eq(schema.gameweekPredictionPicks.predictionId, pred.prediction.id));
        expect(picksAfter).toEqual([]);
    });

    describe('fixtures helpers', () => {
        it('getFixturesByGameweek returns every fixture for that gameweek (any status)', async () => {
            const s = await buildScaffold(10);
            const gw1 = await repository.fixtures.getFixturesByGameweek(s.season.id, 1);
            expect(gw1.map((f) => f.id)).toEqual([s.fixtures.gw1.id]);

            const gw3 = await repository.fixtures.getFixturesByGameweek(s.season.id, 3);
            // Played fixtures still come back — the UI greys them but needs
            // them in the editor.
            expect(gw3.map((f) => f.id)).toEqual([s.fixtures.gw3.id]);
        });

        it('listSelectableGameweeks excludes gameweeks with no scheduled fixtures', async () => {
            const s = await buildScaffold(11);
            const selectable = await repository.fixtures.listSelectableGameweeks(s.season.id);
            // GW1 + GW2 are scheduled; GW3 is fully played (only 1 fixture
            // and it's `played`). Cup tie has null gameweek so doesn't
            // contribute.
            expect(selectable).toEqual([1, 2]);
        });

        it('getActiveGameweek returns the earliest selectable, null when none remain', async () => {
            const s = await buildScaffold(12);
            expect(await repository.fixtures.getActiveGameweek(s.season.id)).toBe(1);

            // Mark GW1 + GW2 as played; only GW3 (already played) remains.
            await db
                .update(schema.fixtures)
                .set({ status: 'played' })
                .where(eq(schema.fixtures.id, s.fixtures.gw1.id));
            await db
                .update(schema.fixtures)
                .set({ status: 'played' })
                .where(eq(schema.fixtures.id, s.fixtures.gw2.id));

            expect(await repository.fixtures.getActiveGameweek(s.season.id)).toBeNull();
        });

        it('getRecommendedRescheduledFixtures returns scheduled fixtures in the between-gameweek window', async () => {
            const s = await buildScaffold(13);
            // GW1 (Aug 10) → CUP (Aug 14, scheduled, null gameweek) → GW2 (Aug 17).
            // For GW1, the next neighbour is GW2; the cup fixture sits in the gap.
            const recommendedForGw1 = await repository.fixtures.getRecommendedRescheduledFixtures(
                s.season.id,
                1,
            );
            expect(recommendedForGw1.map((f) => f.id)).toEqual([s.fixtures.cup.id]);

            // For GW2, the previous neighbour is GW1; same cup sits between them.
            const recommendedForGw2 = await repository.fixtures.getRecommendedRescheduledFixtures(
                s.season.id,
                2,
            );
            expect(recommendedForGw2.map((f) => f.id)).toEqual([s.fixtures.cup.id]);
        });

        it('getRecommendedRescheduledFixtures returns [] at first/last gameweek (no neighbour window)', async () => {
            const s = await buildScaffold(14);
            // GW0 doesn't exist → asking for it returns [].
            expect(
                await repository.fixtures.getRecommendedRescheduledFixtures(s.season.id, 0),
            ).toEqual([]);
            // GW3 is the last numbered gameweek; no GW4 → no upper bound → [].
            expect(
                await repository.fixtures.getRecommendedRescheduledFixtures(s.season.id, 3),
            ).toEqual([]);
        });

        it('getRecommendedRescheduledFixtures excludes non-scheduled fixtures', async () => {
            const s = await buildScaffold(15);
            // Cancel the cup tie — it should drop out of the recommended set.
            await db
                .update(schema.fixtures)
                .set({ status: 'cancelled' })
                .where(eq(schema.fixtures.id, s.fixtures.cup.id));

            const recommended = await repository.fixtures.getRecommendedRescheduledFixtures(
                s.season.id,
                1,
            );
            expect(recommended).toEqual([]);
        });

        it('listSelectableGameweeksByNextKickoff sorts by earliest scheduled fixture, not gameweek number', async () => {
            const s = await buildScaffold(16);
            // Scaffold: GW1=Aug 10 (scheduled), GW2=Aug 17 (scheduled),
            // GW3=Aug 24 (played → not selectable).
            // To verify sort-by-kickoff vs sort-by-number, push GW1 to LATE
            // September — now GW2 (Aug 17) is the soonest, even though
            // gameweek number is higher.
            await db
                .update(schema.fixtures)
                .set({ scheduledAt: new Date('2024-09-30T15:00:00Z') })
                .where(eq(schema.fixtures.id, s.fixtures.gw1.id));

            const result =
                await repository.fixtures.listSelectableGameweeksByNextKickoff(s.season.id);
            expect(result.map((r) => r.gameweek)).toEqual([2, 1]);
            // GW3 is fully played → excluded.
            expect(result.map((r) => r.gameweek)).not.toContain(3);

            // Spot-check the kickoff timestamps round-trip as Dates.
            const gw2 = result.find((r) => r.gameweek === 2);
            expect(gw2?.nextKickoff).toBeInstanceOf(Date);
            expect(gw2?.nextKickoff.toISOString()).toBe('2024-08-17T15:00:00.000Z');
        });
    });
});
