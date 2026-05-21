/**
 * DataLoader unit + integration coverage.
 *
 * Why this exists (issue #50):
 *
 *   - [AI_README_FIRST.MD §5](AI_README_FIRST.MD) makes DataLoaders a hard rule
 *     for nested resolvers — without them, GraphQL fan-out queries blow up into
 *     N+1 repository calls.
 *   - Before this file, `loaders/index.ts` had 0% statement coverage. A
 *     regression that broke batching or cached the wrong keys would only show
 *     up as a production latency spike.
 *   - schema.test.ts:149 ("should query season with teams and venue") already
 *     surfaced the symptom — `ctx.loaders` was missing in test context and the
 *     venue field silently returned null. The test still "passed" because the
 *     resolver threw and the error was swallowed by the nullable field.
 *
 * What's covered here:
 *
 *   - Batching: parallel `.load(a)`, `.load(b)`, `.load(a)` → one repository
 *     call with `[a, b]`, the duplicate is served from cache.
 *   - Order preservation: the loader returns rows in the order of the input
 *     keys, even when the repository returns them in a different order.
 *   - Missing rows: a key with no matching row resolves to `null`, not undefined.
 *   - Per-request scoping: `createLoaders()` returns fresh instances; two
 *     instances do not share a cache.
 *   - End-to-end via GraphQL: a nested query (`fixtures { homeTeam { ... } awayTeam { ... } venue { ... } }`)
 *     hits the team/venue loaders once each across all fixtures, not once per
 *     fixture.
 */
import type * as schema from '../db/schema';

import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { repository } from '../repositories';
import { builder } from '../schema/builder';
import { createLoaders } from './index';

import '../schema/football';

vi.mock('../db', () => ({
    db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

type Team = typeof schema.teams.$inferSelect;
type Venue = typeof schema.venues.$inferSelect;
type Season = typeof schema.seasons.$inferSelect;
type League = typeof schema.leagues.$inferSelect;

describe('DataLoaders — unit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('teamLoader', () => {
        it('batches parallel loads into one repository call', async () => {
            vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
                { id: 't1', name: 'Arsenal' },
                { id: 't2', name: 'Chelsea' },
            ] as Team[]);

            const loaders = createLoaders();
            const [a, b] = await Promise.all([
                loaders.teamLoader.load('t1'),
                loaders.teamLoader.load('t2'),
            ]);

            expect(a?.name).toBe('Arsenal');
            expect(b?.name).toBe('Chelsea');
            expect(repository.teams.getTeamsByIds).toHaveBeenCalledTimes(1);
            expect(repository.teams.getTeamsByIds).toHaveBeenCalledWith(['t1', 't2']);
        });

        it('serves duplicate keys from cache after the first batch', async () => {
            vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
                { id: 't1', name: 'Arsenal' },
                { id: 't2', name: 'Chelsea' },
            ] as Team[]);

            const loaders = createLoaders();
            const [a, b, aAgain] = await Promise.all([
                loaders.teamLoader.load('t1'),
                loaders.teamLoader.load('t2'),
                loaders.teamLoader.load('t1'),
            ]);

            expect(a?.id).toBe('t1');
            expect(b?.id).toBe('t2');
            expect(aAgain?.id).toBe('t1');
            // Duplicate t1 must not have hit the repository twice.
            expect(repository.teams.getTeamsByIds).toHaveBeenCalledTimes(1);
            const passedKeys = vi.mocked(repository.teams.getTeamsByIds).mock.calls[0][0];
            expect([...passedKeys]).toEqual(['t1', 't2']);
        });

        it('preserves key order even when the repository returns rows out of order', async () => {
            vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
                { id: 't2', name: 'Chelsea' },
                { id: 't1', name: 'Arsenal' },
            ] as Team[]);

            const loaders = createLoaders();
            const [a, b] = await Promise.all([
                loaders.teamLoader.load('t1'),
                loaders.teamLoader.load('t2'),
            ]);

            expect(a?.id).toBe('t1');
            expect(b?.id).toBe('t2');
        });

        it('resolves to null for keys with no matching row', async () => {
            vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
                { id: 't1', name: 'Arsenal' },
            ] as Team[]);

            const loaders = createLoaders();
            const [hit, miss] = await Promise.all([
                loaders.teamLoader.load('t1'),
                loaders.teamLoader.load('not-real'),
            ]);

            expect(hit?.id).toBe('t1');
            expect(miss).toBeNull();
        });
    });

    describe('venueLoader', () => {
        it('batches parallel loads and preserves key order', async () => {
            vi.mocked(repository.teams.getVenuesByIds).mockResolvedValue([
                { id: 'v2', name: 'Stamford Bridge' },
                { id: 'v1', name: 'Emirates' },
            ] as Venue[]);

            const loaders = createLoaders();
            const [a, b] = await Promise.all([
                loaders.venueLoader.load('v1'),
                loaders.venueLoader.load('v2'),
            ]);

            expect(repository.teams.getVenuesByIds).toHaveBeenCalledTimes(1);
            expect(repository.teams.getVenuesByIds).toHaveBeenCalledWith(['v1', 'v2']);
            expect(a?.id).toBe('v1');
            expect(b?.id).toBe('v2');
        });

        it('returns null for an unknown venue id', async () => {
            vi.mocked(repository.teams.getVenuesByIds).mockResolvedValue([]);

            const loaders = createLoaders();
            const v = await loaders.venueLoader.load('missing');
            expect(v).toBeNull();
        });
    });

    describe('seasonLoader', () => {
        it('batches season lookups through repository.leagues.getSeasonsByIds', async () => {
            vi.mocked(repository.leagues.getSeasonsByIds).mockResolvedValue([
                { id: 's1', year: 2024 },
                { id: 's2', year: 2025 },
            ] as Season[]);

            const loaders = createLoaders();
            const [a, b] = await Promise.all([
                loaders.seasonLoader.load('s1'),
                loaders.seasonLoader.load('s2'),
            ]);

            expect(repository.leagues.getSeasonsByIds).toHaveBeenCalledTimes(1);
            expect(repository.leagues.getSeasonsByIds).toHaveBeenCalledWith(['s1', 's2']);
            expect(a?.year).toBe(2024);
            expect(b?.year).toBe(2025);
        });
    });

    describe('leagueLoader', () => {
        it('batches league lookups through repository.leagues.getLeaguesByIds', async () => {
            vi.mocked(repository.leagues.getLeaguesByIds).mockResolvedValue([
                { id: 'l1', name: 'Premier League' },
                { id: 'l2', name: 'Championship' },
            ] as League[]);

            const loaders = createLoaders();
            const [a, b] = await Promise.all([
                loaders.leagueLoader.load('l1'),
                loaders.leagueLoader.load('l2'),
            ]);

            expect(repository.leagues.getLeaguesByIds).toHaveBeenCalledTimes(1);
            expect(repository.leagues.getLeaguesByIds).toHaveBeenCalledWith(['l1', 'l2']);
            expect(a?.name).toBe('Premier League');
            expect(b?.name).toBe('Championship');
        });
    });

    describe('per-request scoping', () => {
        it('returns a fresh loader instance per call (no cross-request cache pollution)', async () => {
            vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
                { id: 't1', name: 'Arsenal' },
            ] as Team[]);

            const requestA = createLoaders();
            const requestB = createLoaders();
            expect(requestA).not.toBe(requestB);
            expect(requestA.teamLoader).not.toBe(requestB.teamLoader);

            await requestA.teamLoader.load('t1');
            await requestB.teamLoader.load('t1');

            // Same key in two "requests" → two batches, because the cache is per loader instance.
            expect(repository.teams.getTeamsByIds).toHaveBeenCalledTimes(2);
        });
    });
});

describe('DataLoaders — GraphQL integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Nested query: many fixtures share two home teams, two away teams, and two
     * venues. Without DataLoaders this would be 12 repository calls (4 per
     * fixture); with them it must be 1 per loader (teams once, venues once).
     */
    it('a nested fixtures→teams/venue query batches repository reads via loaders', async () => {
        const fixtures = [
            { id: 'f1', homeTeamId: 't1', awayTeamId: 't2', venueId: 'v1', sourceId: 1 },
            { id: 'f2', homeTeamId: 't1', awayTeamId: 't2', venueId: 'v1', sourceId: 2 },
            { id: 'f3', homeTeamId: 't2', awayTeamId: 't1', venueId: 'v2', sourceId: 3 },
        ] as unknown as (typeof schema.fixtures.$inferSelect)[];
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue(fixtures);

        vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
            { id: 't1', name: 'Arsenal', sourceId: 42 },
            { id: 't2', name: 'Chelsea', sourceId: 49 },
        ] as Team[]);

        vi.mocked(repository.teams.getVenuesByIds).mockResolvedValue([
            { id: 'v1', name: 'Emirates' },
            { id: 'v2', name: 'Stamford Bridge' },
        ] as Venue[]);

        const yoga = createYoga({
            schema: builder.toSchema(),
            context: () => ({ loaders: createLoaders(), user: { id: 'u', roles: ['user'] } }),
        });

        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query {
                        fixtures(seasonId: "season-1") {
                            id
                            homeTeam { id name }
                            awayTeam { id name }
                            venue { id name }
                        }
                    }
                `,
            }),
        });
        const result = await response.json();

        expect(result.errors).toBeUndefined();
        expect(result.data.fixtures).toHaveLength(3);
        expect(result.data.fixtures[0].homeTeam.name).toBe('Arsenal');
        expect(result.data.fixtures[0].venue.name).toBe('Emirates');
        expect(result.data.fixtures[2].homeTeam.name).toBe('Chelsea');

        // Both team-id lookups across 3 fixtures collapse to one repository call.
        expect(repository.teams.getTeamsByIds).toHaveBeenCalledTimes(1);
        expect(repository.teams.getVenuesByIds).toHaveBeenCalledTimes(1);

        const teamIds = vi.mocked(repository.teams.getTeamsByIds).mock.calls[0][0];
        expect(new Set([...teamIds])).toEqual(new Set(['t1', 't2']));
        const venueIds = vi.mocked(repository.teams.getVenuesByIds).mock.calls[0][0];
        expect(new Set([...venueIds])).toEqual(new Set(['v1', 'v2']));
    });

    it('Fixture.season + Fixture.leagueSourceId walk fixture→season→league through the loaders once', async () => {
        const fixtures = [
            { id: 'f1', seasonId: 's1', homeTeamId: 't1', awayTeamId: 't2', sourceId: 1 },
            { id: 'f2', seasonId: 's1', homeTeamId: 't1', awayTeamId: 't2', sourceId: 2 },
            { id: 'f3', seasonId: 's2', homeTeamId: 't1', awayTeamId: 't2', sourceId: 3 },
        ] as unknown as (typeof schema.fixtures.$inferSelect)[];
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue(fixtures);

        vi.mocked(repository.leagues.getSeasonsByIds).mockResolvedValue([
            { id: 's1', year: 2024, leagueId: 'l1' },
            { id: 's2', year: 2025, leagueId: 'l1' },
        ] as Season[]);
        vi.mocked(repository.leagues.getLeaguesByIds).mockResolvedValue([
            { id: 'l1', sourceId: 39 },
        ] as League[]);
        vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
            { id: 't1' },
            { id: 't2' },
        ] as Team[]);

        const yoga = createYoga({
            schema: builder.toSchema(),
            context: () => ({ loaders: createLoaders(), user: { id: 'u', roles: ['user'] } }),
        });

        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query {
                        fixtures(seasonId: "season-1") {
                            id
                            season
                            leagueSourceId
                        }
                    }
                `,
            }),
        });

        const result = await response.json();
        expect(result.errors).toBeUndefined();
        expect(result.data.fixtures.map((f: { season: number }) => f.season)).toEqual([
            2024, 2024, 2025,
        ]);
        expect(result.data.fixtures[0].leagueSourceId).toBe(39);

        // Three fixtures, two distinct seasons, one distinct league —
        // one batched call to each loader.
        expect(repository.leagues.getSeasonsByIds).toHaveBeenCalledTimes(1);
        expect(repository.leagues.getLeaguesByIds).toHaveBeenCalledTimes(1);
    });
});
