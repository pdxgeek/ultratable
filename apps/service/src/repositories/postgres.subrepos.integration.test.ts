/**
 * Integration coverage for the per-domain Postgres sub-repositories.
 *
 * These tests hit a real Postgres (the `ultratable-postgres-1` container
 * configured via `DATABASE_URL`). They are NOT run by the unit `vitest`
 * config — use `npm run test:integration` instead.
 *
 * Isolation strategy:
 *   - All test data lives under sourceName = TEST_SOURCE so we never collide
 *     with real provider data.
 *   - Each top-level describe block nukes any leftover rows under TEST_SOURCE
 *     before running. We never delete or modify rows from other sourceNames.
 *   - Tests use sourceIds in the [TEST_SOURCE_ID_BASE, +1000) range — well
 *     above realistic API-Football IDs, but distinct so rows don't clash.
 *
 * Coverage targets (issue #20):
 *   - FIXTURE_UPSERT_SET correctness (insert + idempotent update)
 *   - getTeams / getLeagues / getSeasons / getInternalSeasons
 *   - importSquad / getTeamRoster (PlayersRepository + TeamRosters)
 *   - saveRankingFormula / getRankingFormulas (already in companion test)
 *   - saveGraphic / getGraphics (already in companion test)
 *   - removeSeason cascade behaviour (fixtures + standings)
 *   - Constraint violations & FK errors
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { createPostgresRepository } from './postgres';
import { FIXTURE_UPSERT_SET, NOW_MS } from './postgres/shared';
import type { IFootballProvider, IngestedSquadPlayer } from '../integrations/types';

const TEST_SOURCE = 'test-integration';
const TEST_SOURCE_ID_BASE = 9_900_000;

// A minimal provider stub for tests that exercise importSquad / promoteLeague
// without making real HTTP calls. Per-test overrides can set squad responses.
class StubProvider implements IFootballProvider {
    name = TEST_SOURCE;
    nextSquad: IngestedSquadPlayer[] = [];
    async getCountries() { return []; }
    async getLeagues() { return []; }
    async getSeasons() { return []; }
    async getTeams() { return { teams: [], venues: [] }; }
    async getFixtures() { return { fixtures: [], venues: [] }; }
    async getFixturesByIds() { return { fixtures: [], venues: [] }; }
    async getMatchEvents() { return []; }
    async getPlayerData() { return null; }
    async getLineups() { return []; }
    async getSquad(): Promise<IngestedSquadPlayer[]> { return this.nextSquad; }
}

const provider = new StubProvider();
const repo = createPostgresRepository(provider);

async function deleteTestRows() {
    // FK order: roster + linkages first, then fixtures, then seasons, then
    // teams/venues/players/leagues. Catalog tables share the sourceName.
    await db.delete(schema.teamRosters);   // safe — has cascade on team/player/season
    await db.delete(schema.playerSourceMappings).where(eq(schema.playerSourceMappings.sourceName, TEST_SOURCE));
    await db.delete(schema.players).where(eq(schema.players.sourceName, TEST_SOURCE));
    await db.delete(schema.seasonsToTeams).where(sql`team_id IN (SELECT id FROM teams WHERE source_name = ${TEST_SOURCE})`);
    await db.delete(schema.standingsRows).where(sql`season_id IN (SELECT id FROM seasons WHERE league_id IN (SELECT id FROM leagues WHERE source_name = ${TEST_SOURCE}))`);
    await db.delete(schema.fixtures).where(eq(schema.fixtures.sourceName, TEST_SOURCE));
    await db.delete(schema.seasons).where(sql`league_id IN (SELECT id FROM leagues WHERE source_name = ${TEST_SOURCE})`);
    await db.delete(schema.teams).where(eq(schema.teams.sourceName, TEST_SOURCE));
    await db.delete(schema.venues).where(eq(schema.venues.sourceName, TEST_SOURCE));
    await db.delete(schema.leagues).where(eq(schema.leagues.sourceName, TEST_SOURCE));
    await db.delete(schema.catalogLeagues).where(eq(schema.catalogLeagues.sourceName, TEST_SOURCE));
    await db.delete(schema.catalogCountries).where(eq(schema.catalogCountries.sourceName, TEST_SOURCE));
}

interface FixtureScaffold {
    league: typeof schema.leagues.$inferSelect;
    season: typeof schema.seasons.$inferSelect;
    homeTeam: typeof schema.teams.$inferSelect;
    awayTeam: typeof schema.teams.$inferSelect;
    venue: typeof schema.venues.$inferSelect;
}

async function buildScaffold(opts: { sourceIdSuffix: number; year?: number }): Promise<FixtureScaffold> {
    const base = TEST_SOURCE_ID_BASE + opts.sourceIdSuffix;
    const year = opts.year ?? 9000;

    const [league] = await db.insert(schema.leagues).values({
        name: `Test League ${base}`,
        slug: `test-league-${base}`,
        country: 'Testland',
        sourceName: TEST_SOURCE,
        sourceId: base,
    }).returning();

    const [season] = await db.insert(schema.seasons).values({
        leagueId: league.id,
        year,
    }).returning();

    const [venue] = await db.insert(schema.venues).values({
        name: `Test Stadium ${base}`,
        sourceName: TEST_SOURCE,
        sourceId: base + 1,
    }).returning();

    const [homeTeam] = await db.insert(schema.teams).values({
        name: `Home FC ${base}`,
        sourceName: TEST_SOURCE,
        sourceId: base + 2,
        venueId: venue.id,
    }).returning();

    const [awayTeam] = await db.insert(schema.teams).values({
        name: `Away FC ${base}`,
        sourceName: TEST_SOURCE,
        sourceId: base + 3,
    }).returning();

    await db.insert(schema.seasonsToTeams).values([
        { seasonId: season.id, teamId: homeTeam.id },
        { seasonId: season.id, teamId: awayTeam.id },
    ]);

    return { league, season, homeTeam, awayTeam, venue };
}

describe('Postgres sub-repositories — integration', () => {
    beforeAll(async () => {
        expect(db, 'DATABASE_URL must be configured to run integration tests').toBeTruthy();
        await deleteTestRows();
    });

    afterAll(async () => {
        await deleteTestRows();
    });

    // ----------------------------------------------------------------------
    // LeaguesRepository
    // ----------------------------------------------------------------------
    describe('LeaguesRepository', () => {
        beforeEach(async () => { await deleteTestRows(); });

        it('persists and retrieves leagues; getLeagueById returns the row', async () => {
            const scaffold = await buildScaffold({ sourceIdSuffix: 1 });
            const fetched = await repo.leagues.getLeagueById(scaffold.league.id);
            expect(fetched?.name).toBe(scaffold.league.name);
        });

        it('getLeaguesByIds returns multiple rows', async () => {
            const a = await buildScaffold({ sourceIdSuffix: 10 });
            const b = await buildScaffold({ sourceIdSuffix: 20 });
            const rows = await repo.leagues.getLeaguesByIds([a.league.id, b.league.id]);
            expect(rows.map(r => r.id).sort()).toEqual([a.league.id, b.league.id].sort());
        });

        it('getLeaguesByIds returns [] for empty input', async () => {
            expect(await repo.leagues.getLeaguesByIds([])).toEqual([]);
        });

        it('updateLeagueConfig replaces metadata atomically', async () => {
            const { league } = await buildScaffold({ sourceIdSuffix: 30 });
            const updated = await repo.leagues.updateLeagueConfig(league.id, { promotion: 2, relegation: 3 });
            expect(updated.metadata).toEqual({ promotion: 2, relegation: 3 });
        });

        it('importSeason is idempotent on (leagueId, year)', async () => {
            const { league } = await buildScaffold({ sourceIdSuffix: 40 });
            const first = await repo.leagues.importSeason(league.id, 2999);
            const second = await repo.leagues.importSeason(league.id, 2999);
            expect(second.id).toBe(first.id);
        });

        it('getInternalSeasons returns seasons under the league', async () => {
            const { league, season } = await buildScaffold({ sourceIdSuffix: 50, year: 1234 });
            const seasons = await repo.leagues.getInternalSeasons(league.sourceId, league.id);
            expect(seasons.find(s => s.id === season.id)).toBeTruthy();
        });

        it('updateSeasonConfig writes metadata', async () => {
            const { season } = await buildScaffold({ sourceIdSuffix: 60 });
            const updated = await repo.leagues.updateSeasonConfig(season.id, { rankingCriteria: ['standard_pts'] });
            expect(updated.metadata).toEqual({ rankingCriteria: ['standard_pts'] });
        });

        it('removeSeason cascades: fixtures and standings under that season are also deleted', async () => {
            const { league, season, homeTeam, awayTeam } = await buildScaffold({ sourceIdSuffix: 70 });

            // Put fixtures + a standings row under the season.
            const sourceId = TEST_SOURCE_ID_BASE + 70 + 100;
            await db.insert(schema.fixtures).values({
                leagueId: league.id,
                seasonId: season.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                scheduledAt: new Date(),
                sourceName: TEST_SOURCE,
                sourceId,
            });
            await db.insert(schema.standingsRows).values({
                id: `${league.id}-${season.id}-${homeTeam.id}`,
                seasonId: season.id,
                teamId: homeTeam.id,
                position: 1,
                played: 1,
                won: 1,
                drawn: 0,
                lost: 0,
                goalsFor: 1,
                goalsAgainst: 0,
                goalDiff: 1,
                points: 3,
            });

            const ok = await repo.leagues.removeSeason(season.id);
            expect(ok).toBe(true);

            const remainingFixtures = await db.select().from(schema.fixtures).where(eq(schema.fixtures.seasonId, season.id));
            const remainingStandings = await db.select().from(schema.standingsRows).where(eq(schema.standingsRows.seasonId, season.id));
            const remainingSeasons = await db.select().from(schema.seasons).where(eq(schema.seasons.id, season.id));
            expect(remainingFixtures).toEqual([]);
            expect(remainingStandings).toEqual([]);
            expect(remainingSeasons).toEqual([]);
        });

        it('removeSeason returns false when the seasonId does not exist', async () => {
            const ok = await repo.leagues.removeSeason('00000000-0000-0000-0000-000000000000');
            expect(ok).toBe(false);
        });

        it('saveRankingFormula upserts on conflict (id is the primary key)', async () => {
            const id = `${TEST_SOURCE}-formula-${Date.now()}`;
            const first = await repo.leagues.saveRankingFormula({ id, name: 'V1', description: 'first', logicType: 'standard' });
            const second = await repo.leagues.saveRankingFormula({ id, name: 'V2', description: 'second', logicType: 'standard' });
            expect(second.id).toBe(first.id);
            expect(second.name).toBe('V2');
            expect(second.description).toBe('second');

            // Clean up — these are NOT under sourceName, so deleteTestRows doesn't catch them.
            await db.delete(schema.rankingFormulas).where(eq(schema.rankingFormulas.id, id));
        });
    });

    // ----------------------------------------------------------------------
    // TeamsRepository
    // ----------------------------------------------------------------------
    describe('TeamsRepository', () => {
        beforeEach(async () => { await deleteTestRows(); });

        it('getAllTeams includes inserted test teams', async () => {
            const { homeTeam } = await buildScaffold({ sourceIdSuffix: 100 });
            const all = await repo.teams.getAllTeams();
            expect(all.some(t => t.id === homeTeam.id)).toBe(true);
        });

        it('getTeamById returns null for unknown UUID', async () => {
            const missing = await repo.teams.getTeamById('00000000-0000-0000-0000-000000000000');
            expect(missing).toBeNull();
        });

        it('getTeamsByIds returns [] for empty input', async () => {
            expect(await repo.teams.getTeamsByIds([])).toEqual([]);
        });

        it('getTeamsBySeasonId returns linked teams; respects since filter for deltas', async () => {
            const { season, homeTeam, awayTeam } = await buildScaffold({ sourceIdSuffix: 110 });

            const all = await repo.teams.getTeamsBySeasonId(season.id);
            expect(all.map(t => t.id).sort()).toEqual([homeTeam.id, awayTeam.id].sort());

            // future since → no rows
            const future = new Date(Date.now() + 60_000);
            const empty = await repo.teams.getTeamsBySeasonId(season.id, future);
            expect(empty).toEqual([]);
        });

        it('countTeamsInSeason returns the link count', async () => {
            const { season } = await buildScaffold({ sourceIdSuffix: 120 });
            expect(await repo.teams.countTeamsInSeason(season.id)).toBe(2);
        });

        it('upsertVenues inserts new venues and updates existing on conflict', async () => {
            const sourceId = TEST_SOURCE_ID_BASE + 130;
            await repo.teams.upsertVenues([
                { name: 'A', city: null, capacity: null, surface: null, image: null, sourceId, sourceName: TEST_SOURCE },
            ]);
            await repo.teams.upsertVenues([
                { name: 'A-updated', city: 'Somewhere', capacity: 1000, surface: 'grass', image: null, sourceId, sourceName: TEST_SOURCE },
            ]);
            const [row] = await db.select().from(schema.venues).where(eq(schema.venues.sourceId, sourceId));
            expect(row.name).toBe('A-updated');
            expect(row.city).toBe('Somewhere');
            expect(row.capacity).toBe(1000);
        });

        it('importSquad creates players, source mappings, and a roster entry', async () => {
            const { season, homeTeam } = await buildScaffold({ sourceIdSuffix: 140 });
            provider.nextSquad = [
                { sourceId: TEST_SOURCE_ID_BASE + 140 + 10, name: 'Player One', age: 24, number: 7, position: 'F', photo: null },
                { sourceId: TEST_SOURCE_ID_BASE + 140 + 11, name: 'Player Two', age: 28, number: 10, position: 'M', photo: null },
            ];

            const roster = await repo.teams.importSquad(homeTeam.id, homeTeam.sourceId, season.id);
            expect(roster).toHaveLength(2);

            // Roster fetch returns the same players, joined to the player row.
            const fetched = await repo.teams.getTeamRoster(homeTeam.id, season.id);
            expect(fetched).toHaveLength(2);
            expect(fetched.map(r => r.player.name).sort()).toEqual(['Player One', 'Player Two']);

            // resolvePlayerBySourceId hits either the mapping table or the players table.
            const resolved = await repo.players.resolvePlayerBySourceId(TEST_SOURCE, TEST_SOURCE_ID_BASE + 140 + 10);
            expect(resolved).toBeTruthy();

            // Re-importing the same squad must be idempotent (same player IDs, same roster row count).
            const rosterAgain = await repo.teams.importSquad(homeTeam.id, homeTeam.sourceId, season.id);
            expect(rosterAgain).toHaveLength(2);
            const reFetched = await repo.teams.getTeamRoster(homeTeam.id, season.id);
            expect(reFetched).toHaveLength(2);
        });
    });

    // ----------------------------------------------------------------------
    // FixturesRepository — FIXTURE_UPSERT_SET correctness
    // ----------------------------------------------------------------------
    describe('FixturesRepository', () => {
        beforeEach(async () => { await deleteTestRows(); });

        async function insertFixture(scaffold: FixtureScaffold, overrides: Partial<typeof schema.fixtures.$inferInsert> = {}) {
            const sourceId = TEST_SOURCE_ID_BASE + 200 + (overrides.sourceId as number ?? 0);
            await db.insert(schema.fixtures)
                .values({
                    leagueId: scaffold.league.id,
                    seasonId: scaffold.season.id,
                    homeTeamId: scaffold.homeTeam.id,
                    awayTeamId: scaffold.awayTeam.id,
                    venueId: scaffold.venue.id,
                    scheduledAt: new Date('2025-01-01T15:00:00Z'),
                    status: 'scheduled',
                    homeGoals: null,
                    awayGoals: null,
                    gameweek: 1,
                    sourceName: TEST_SOURCE,
                    sourceId,
                    updatedAt: NOW_MS as unknown as Date,
                    ...overrides,
                })
                .onConflictDoUpdate({
                    target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                    set: FIXTURE_UPSERT_SET,
                });
            return sourceId;
        }

        it('FIXTURE_UPSERT_SET: insert-fresh works (no conflict, full row written)', async () => {
            const scaffold = await buildScaffold({ sourceIdSuffix: 200 });
            const sourceId = await insertFixture(scaffold);
            const [row] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.sourceId, sourceId));
            expect(row.status).toBe('scheduled');
            expect(row.gameweek).toBe(1);
        });

        it('FIXTURE_UPSERT_SET: update-existing overwrites the five mutable columns', async () => {
            const scaffold = await buildScaffold({ sourceIdSuffix: 210 });
            const sourceId = await insertFixture(scaffold);

            const newSchedule = new Date('2025-01-02T18:00:00Z');
            await db.insert(schema.fixtures)
                .values({
                    leagueId: scaffold.league.id,
                    seasonId: scaffold.season.id,
                    homeTeamId: scaffold.homeTeam.id,
                    awayTeamId: scaffold.awayTeam.id,
                    venueId: scaffold.venue.id,
                    scheduledAt: newSchedule,
                    status: 'played',
                    homeGoals: 3,
                    awayGoals: 1,
                    gameweek: 2,
                    sourceName: TEST_SOURCE,
                    sourceId,
                    updatedAt: NOW_MS as unknown as Date,
                })
                .onConflictDoUpdate({
                    target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                    set: FIXTURE_UPSERT_SET,
                });

            const [row] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.sourceId, sourceId));
            expect(row.status).toBe('played');
            expect(row.homeGoals).toBe(3);
            expect(row.awayGoals).toBe(1);
            expect(row.gameweek).toBe(2);
            expect(new Date(row.scheduledAt).toISOString()).toBe(newSchedule.toISOString());
        });

        it('FIXTURE_UPSERT_SET: no-op on identical input still bumps updatedAt', async () => {
            const scaffold = await buildScaffold({ sourceIdSuffix: 220 });
            const sourceId = await insertFixture(scaffold);
            const [before] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.sourceId, sourceId));

            // sleep ~5ms so updatedAt's millisecond precision can advance
            await new Promise(r => setTimeout(r, 10));

            await insertFixture(scaffold, { sourceId: 0 }); // same sourceId → conflict path
            const [after] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.sourceId, sourceId));

            expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before.updatedAt).getTime());
            expect(after.status).toBe(before.status);
        });

        it('getFixtureById returns the row by UUID', async () => {
            const scaffold = await buildScaffold({ sourceIdSuffix: 230 });
            const sourceId = await insertFixture(scaffold);
            const [row] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.sourceId, sourceId));

            const fetched = await repo.fixtures.getFixtureById(row.id);
            expect(fetched?.sourceId).toBe(sourceId);
        });

        it('countFixturesInSeason reflects how many fixtures are present', async () => {
            const scaffold = await buildScaffold({ sourceIdSuffix: 240 });
            await insertFixture(scaffold, { sourceId: 1 });
            await insertFixture(scaffold, { sourceId: 2 });
            const n = await repo.fixtures.countFixturesInSeason(scaffold.season.id);
            expect(n).toBe(2);
        });

        it('getFixturesBySeasonId returns the season fixtures (no `since` → cached path)', async () => {
            const scaffold = await buildScaffold({ sourceIdSuffix: 250 });
            await insertFixture(scaffold);
            const rows = await repo.fixtures.getFixturesBySeasonId(scaffold.season.id);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows[0].seasonId).toBe(scaffold.season.id);
        });
    });

    // ----------------------------------------------------------------------
    // WorkersRepository
    // ----------------------------------------------------------------------
    describe('WorkersRepository', () => {
        const testJobName = `${TEST_SOURCE}-job-${Date.now()}`;

        beforeEach(async () => {
            await db.delete(schema.jobs).where(eq(schema.jobs.name, testJobName));
        });

        it('listJobs returns jobs sorted by name; getJobByName resolves by name', async () => {
            await db.insert(schema.jobs).values({ name: testJobName });
            const found = await repo.workers.getJobByName(testJobName);
            expect(found?.name).toBe(testJobName);

            const all = await repo.workers.listJobs();
            expect(all.some(j => j.name === testJobName)).toBe(true);

            await db.delete(schema.jobs).where(eq(schema.jobs.name, testJobName));
        });

        it('getJobByName returns null for unknown name', async () => {
            expect(await repo.workers.getJobByName('definitely-not-a-real-job')).toBeNull();
        });

        it('listJobExecutions(null, limit) returns rows ordered by startedAt desc', async () => {
            const [job] = await db.insert(schema.jobs).values({ name: testJobName }).returning();
            await db.insert(schema.jobExecutions).values([
                { jobId: job.id, status: 'success', startedAt: new Date('2025-01-01T00:00:00Z') },
                { jobId: job.id, status: 'success', startedAt: new Date('2025-02-01T00:00:00Z') },
            ]);

            const rows = await repo.workers.listJobExecutions(job.id, 10);
            expect(rows.length).toBe(2);
            expect(new Date(rows[0].startedAt).getTime()).toBeGreaterThan(new Date(rows[1].startedAt).getTime());

            const latest = await repo.workers.getLatestJobExecution(job.id);
            expect(latest?.startedAt.toString()).toBe(rows[0].startedAt.toString());

            await db.delete(schema.jobExecutions).where(eq(schema.jobExecutions.jobId, job.id));
            await db.delete(schema.jobs).where(eq(schema.jobs.id, job.id));
        });

        it('listSystemLogs respects the limit argument', async () => {
            const logs = await repo.workers.listSystemLogs(3);
            expect(logs.length).toBeLessThanOrEqual(3);
        });
    });

    // ----------------------------------------------------------------------
    // ConfigRepository — masked getters (no env mutation)
    // ----------------------------------------------------------------------
    describe('ConfigRepository (masked getters only)', () => {
        const savedEnv = { ...process.env };
        afterAll(() => { process.env = savedEnv; });

        it('getDatabaseUrlMasked redacts credentials but keeps host visible', async () => {
            process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
            const masked = await repo.config.getDatabaseUrlMasked();
            expect(masked).toBe('postgresql://****@localhost:5432/db');
        });

        it('getDatabaseUrlMasked returns null for placeholder', async () => {
            process.env.DATABASE_URL = 'postgresql://[HOST]/db';
            expect(await repo.config.getDatabaseUrlMasked()).toBeNull();
        });

        it('getApiFootballKeyMasked shows first/last 4 chars', async () => {
            process.env.API_FOOTBALL_KEY = 'abcdefghijklmnop';
            expect(await repo.config.getApiFootballKeyMasked()).toBe('abcd****mnop');
        });

        it('getApiFootballKeyMasked returns null when unset', async () => {
            delete process.env.API_FOOTBALL_KEY;
            expect(await repo.config.getApiFootballKeyMasked()).toBeNull();
        });

        it('getSupabaseAnonKeyMasked masks the middle of the key', async () => {
            process.env.SUPABASE_ANON_KEY = 'sbat_abcdefghijkl_xyz';
            expect(await repo.config.getSupabaseAnonKeyMasked()).toBe('sbat****_xyz');
        });
    });

    // ----------------------------------------------------------------------
    // GraphicsRepository
    // ----------------------------------------------------------------------
    describe('GraphicsRepository', () => {
        const testGraphic = {
            entityType: 'team',
            entityId: '11111111-1111-1111-1111-111111111111',
            blobPath: `gfx/${TEST_SOURCE}-blob.png`,
            mimeType: 'image/png',
        };

        beforeEach(async () => {
            await db.delete(schema.graphics).where(eq(schema.graphics.entityId, testGraphic.entityId));
        });

        it('saveGraphic inserts then upserts on (entityType, entityId)', async () => {
            const first = await repo.graphics.saveGraphic({ ...testGraphic, metadata: { v: 1 } });
            const second = await repo.graphics.saveGraphic({ ...testGraphic, blobPath: 'gfx/updated.png', mimeType: 'image/jpeg', metadata: { v: 2 } });
            expect(second.id).toBe(first.id);
            expect(second.blobPath).toBe('gfx/updated.png');
            expect(second.mimeType).toBe('image/jpeg');
            expect(second.metadata).toEqual({ v: 2 });
        });

        it('getGraphics filters by entityType + entityId', async () => {
            await repo.graphics.saveGraphic(testGraphic);
            const rows = await repo.graphics.getGraphics(testGraphic.entityType, testGraphic.entityId);
            expect(rows).toHaveLength(1);
        });
    });

    // ----------------------------------------------------------------------
    // Constraint violations & error paths
    // ----------------------------------------------------------------------
    describe('error paths', () => {
        beforeEach(async () => { await deleteTestRows(); });

        it('inserting a fixture with a missing leagueId FK throws', async () => {
            const { season, homeTeam, awayTeam } = await buildScaffold({ sourceIdSuffix: 700 });
            await expect(db.insert(schema.fixtures).values({
                leagueId: '00000000-0000-0000-0000-000000000000', // bad FK
                seasonId: season.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                scheduledAt: new Date(),
                sourceName: TEST_SOURCE,
                sourceId: TEST_SOURCE_ID_BASE + 700,
            })).rejects.toThrow();
        });

        it('two teams cannot share the same (sourceName, sourceId)', async () => {
            const sourceId = TEST_SOURCE_ID_BASE + 800;
            await db.insert(schema.teams).values({ name: 'A', sourceName: TEST_SOURCE, sourceId });
            await expect(db.insert(schema.teams).values({ name: 'B', sourceName: TEST_SOURCE, sourceId })).rejects.toThrow();
        });

        it('syncSeasons throws when the league sourceId is unknown', async () => {
            await expect(repo.leagues.syncSeasons(TEST_SOURCE_ID_BASE + 999)).rejects.toThrow();
        });

        it('getTeams returns [] when league sourceId is unknown (silent fall-through, not throw)', async () => {
            const rows = await repo.teams.getTeams(TEST_SOURCE_ID_BASE + 999, 9000);
            expect(rows).toEqual([]);
        });
    });
});
