/**
 * Field-level resolver coverage for schema/football.ts — issue #54.
 *
 * After #49, schema.test.ts covers the Query roots and one admin mutation. The
 * field resolvers (Season.teamCount, Season.rankingCriteria, Fixture.events,
 * etc.) and mutation edge cases (importSquad team-not-found, player UUID→sourceId
 * resolution) are still mostly unexercised.
 *
 * Each test fires a real GraphQL operation through Yoga so we catch shape
 * mismatches a unit test on the resolver alone would miss (e.g. a non-null
 * field that the resolver returns null for would silently coerce in a unit
 * test but throws here).
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema';
import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { builder } from './builder';

import './football';

vi.mock('../db', () => ({ db: { select: vi.fn(), insert: vi.fn() } }));

vi.mock('../workers/runner', () => ({
    JobRunner: {
        run: vi.fn().mockImplementation((_name: string, task: () => Promise<unknown>) => task()),
    },
}));

vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

const yoga = createYoga({
    schema: builder.toSchema(),
    context: () => ({
        user: { id: 'u1', roles: ['user'] },
        loaders: createLoaders(),
    }),
});

const adminYoga = createYoga({
    schema: builder.toSchema(),
    context: () => ({
        user: { id: 'admin-1', roles: ['admin'] },
        loaders: createLoaders(),
    }),
});

async function fire(
    y: typeof yoga,
    query: string,
): Promise<{ errors?: Array<{ message: string }>; data?: Record<string, unknown> }> {
    const res = await y.fetch('http://localhost:8080/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    return res.json();
}

describe('Season field resolvers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Season.teamCount returns 0 (not null) when no teams link to the season', async () => {
        vi.mocked(repository.leagues.getLeagueById).mockResolvedValue({
            id: 'l1',
            sourceId: 39,
        } as unknown as typeof schema.leagues.$inferSelect);
        vi.mocked(repository.leagues.getInternalSeasons).mockResolvedValue([
            { id: 's1', year: 2024, leagueId: 'l1' },
        ] as unknown as (typeof schema.seasons.$inferSelect)[]);
        vi.mocked(repository.teams.countTeamsInSeason).mockResolvedValue(0);

        const r = await fire(yoga, `query { seasons(leagueId: "l1") { id teamCount } }`);
        expect(r.errors).toBeUndefined();
        const seasons = r.data?.seasons as Array<{ teamCount: number }>;
        expect(seasons[0].teamCount).toBe(0);
    });

    it('Season.teams forwards the `since` arg through to getTeamsBySeasonId', async () => {
        // Use the top-level `teams` query directly — same resolver path and
        // signature, but easier to wire the `since` arg through.
        const ts = new Date('2026-03-01T00:00:00Z');
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue([
            { id: 't1', name: 'Arsenal' },
        ] as unknown as (typeof schema.teams.$inferSelect)[]);

        const r = await fire(
            yoga,
            `query { teams(seasonId: "s1", since: "${ts.toISOString()}") { id name } }`,
        );
        expect(r.errors).toBeUndefined();
        expect(repository.teams.getTeamsBySeasonId).toHaveBeenCalledWith('s1', expect.any(Date));
        const calledWith = vi.mocked(repository.teams.getTeamsBySeasonId).mock.calls[0][1];
        expect(calledWith).toBeInstanceOf(Date);
        expect((calledWith as Date).toISOString()).toBe(ts.toISOString());
    });

    it('Season.rankingCriteria falls back to the default order when metadata is absent', async () => {
        vi.mocked(repository.leagues.getLeagueById).mockResolvedValue({
            id: 'l1',
            sourceId: 39,
        } as unknown as typeof schema.leagues.$inferSelect);
        vi.mocked(repository.leagues.getInternalSeasons).mockResolvedValue([
            { id: 's1', year: 2024, leagueId: 'l1', metadata: null },
        ] as unknown as (typeof schema.seasons.$inferSelect)[]);
        vi.mocked(repository.leagues.getRankingFormulas).mockResolvedValue([
            { id: 'standard_pts', name: 'Points', logicType: 'pts' },
            { id: 'goal_diff', name: 'GD', logicType: 'gd' },
            { id: 'goals_for', name: 'GF', logicType: 'gf' },
            { id: 'head_to_head', name: 'H2H', logicType: 'h2h' },
            { id: 'wins', name: 'Wins', logicType: 'w' },
            { id: 'away_goals', name: 'Away Goals', logicType: 'ag' },
        ] as unknown as (typeof schema.rankingFormulas.$inferSelect)[]);

        const r = await fire(yoga, `query { seasons(leagueId: "l1") { rankingCriteria { id } } }`);
        expect(r.errors).toBeUndefined();
        const seasons = r.data?.seasons as Array<{ rankingCriteria: Array<{ id: string }> }>;
        expect(seasons[0].rankingCriteria.map((c) => c.id)).toEqual([
            'standard_pts',
            'goal_diff',
            'goals_for',
            'head_to_head',
            'wins',
            'away_goals',
        ]);
    });

    it('Season.rankingCriteria honours metadata.rankingCriteria order over the default', async () => {
        vi.mocked(repository.leagues.getLeagueById).mockResolvedValue({
            id: 'l1',
            sourceId: 39,
        } as unknown as typeof schema.leagues.$inferSelect);
        vi.mocked(repository.leagues.getInternalSeasons).mockResolvedValue([
            {
                id: 's1',
                year: 2024,
                leagueId: 'l1',
                metadata: { rankingCriteria: ['goal_diff', 'standard_pts'] },
            },
        ] as unknown as (typeof schema.seasons.$inferSelect)[]);
        vi.mocked(repository.leagues.getRankingFormulas).mockResolvedValue([
            // Repo returns them ORDER BY id — naive .filter would lose the override order.
            { id: 'goal_diff', name: 'GD', logicType: 'gd' },
            { id: 'standard_pts', name: 'Pts', logicType: 'pts' },
            { id: 'wins', name: 'Wins', logicType: 'w' },
        ] as unknown as (typeof schema.rankingFormulas.$inferSelect)[]);

        const r = await fire(yoga, `query { seasons(leagueId: "l1") { rankingCriteria { id } } }`);
        const seasons = r.data?.seasons as Array<{ rankingCriteria: Array<{ id: string }> }>;
        // Order from metadata must be preserved exactly.
        expect(seasons[0].rankingCriteria.map((c) => c.id)).toEqual(['goal_diff', 'standard_pts']);
    });

    it('Season.rankingCriteria silently drops criteria ids that have no matching formula', async () => {
        vi.mocked(repository.leagues.getLeagueById).mockResolvedValue({
            id: 'l1',
            sourceId: 39,
        } as unknown as typeof schema.leagues.$inferSelect);
        vi.mocked(repository.leagues.getInternalSeasons).mockResolvedValue([
            {
                id: 's1',
                year: 2024,
                leagueId: 'l1',
                metadata: { rankingCriteria: ['standard_pts', 'ghost_formula_id'] },
            },
        ] as unknown as (typeof schema.seasons.$inferSelect)[]);
        vi.mocked(repository.leagues.getRankingFormulas).mockResolvedValue([
            { id: 'standard_pts', name: 'Pts', logicType: 'pts' },
        ] as unknown as (typeof schema.rankingFormulas.$inferSelect)[]);

        const r = await fire(yoga, `query { seasons(leagueId: "l1") { rankingCriteria { id } } }`);
        const seasons = r.data?.seasons as Array<{ rankingCriteria: Array<{ id: string }> }>;
        expect(seasons[0].rankingCriteria.map((c) => c.id)).toEqual(['standard_pts']);
    });

    it('Season.fixtureCount delegates to repository.fixtures.countFixturesInSeason', async () => {
        vi.mocked(repository.leagues.getLeagueById).mockResolvedValue({
            id: 'l1',
            sourceId: 39,
        } as unknown as typeof schema.leagues.$inferSelect);
        vi.mocked(repository.leagues.getInternalSeasons).mockResolvedValue([
            { id: 's1', year: 2024, leagueId: 'l1' },
        ] as unknown as (typeof schema.seasons.$inferSelect)[]);
        vi.mocked(repository.fixtures.countFixturesInSeason).mockResolvedValue(380);

        const r = await fire(yoga, `query { seasons(leagueId: "l1") { fixtureCount } }`);
        const seasons = r.data?.seasons as Array<{ fixtureCount: number }>;
        expect(seasons[0].fixtureCount).toBe(380);
        expect(repository.fixtures.countFixturesInSeason).toHaveBeenCalledWith('s1');
    });
});

describe('Fixture field resolvers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Fixture.events proxies to repository.fixtures.getMatchEvents with the fixture sourceId', async () => {
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue([
            { id: 'f1', sourceId: 99001, homeTeamId: 't1', awayTeamId: 't2' },
        ] as unknown as (typeof schema.fixtures.$inferSelect)[]);
        vi.mocked(repository.fixtures.getMatchEvents).mockResolvedValue([
            {
                fixtureId: 99001,
                teamId: 1,
                type: 'Goal',
                detail: 'Normal Goal',
                minute: 23,
                playerName: 'M. Salah',
            },
        ] as unknown as Awaited<ReturnType<typeof repository.fixtures.getMatchEvents>>);

        const r = await fire(
            yoga,
            `query { fixtures(seasonId: "s1") { id events { type detail minute playerName } } }`,
        );
        expect(r.errors).toBeUndefined();
        const fixtures = r.data?.fixtures as Array<{ events: Array<{ type: string }> }>;
        expect(fixtures[0].events[0].type).toBe('Goal');
        expect(repository.fixtures.getMatchEvents).toHaveBeenCalledWith(99001);
    });

    it('Fixture.lineups proxies to repository.fixtures.getLineups with the fixture sourceId', async () => {
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue([
            { id: 'f1', sourceId: 99002, homeTeamId: 't1', awayTeamId: 't2' },
        ] as unknown as (typeof schema.fixtures.$inferSelect)[]);
        vi.mocked(repository.fixtures.getLineups).mockResolvedValue([
            {
                teamSourceId: 1,
                teamName: 'Arsenal',
                teamLogo: null,
                formation: '4-3-3',
                coachName: null,
                coachPhoto: null,
                startXI: [],
                substitutes: [],
            },
        ] as unknown as Awaited<ReturnType<typeof repository.fixtures.getLineups>>);

        const r = await fire(
            yoga,
            `query { fixtures(seasonId: "s1") { id lineups { teamName formation } } }`,
        );
        const fixtures = r.data?.fixtures as Array<{
            lineups: Array<{ teamName: string; formation: string }>;
        }>;
        expect(fixtures[0].lineups[0].formation).toBe('4-3-3');
        expect(repository.fixtures.getLineups).toHaveBeenCalledWith(99002);
    });

    it('Fixture.goalsHome / goalsAway expose homeGoals / awayGoals (renamed), null pre-kickoff', async () => {
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue([
            {
                id: 'f1',
                sourceId: 1,
                homeTeamId: 't1',
                awayTeamId: 't2',
                homeGoals: null,
                awayGoals: null,
            },
            {
                id: 'f2',
                sourceId: 2,
                homeTeamId: 't1',
                awayTeamId: 't2',
                homeGoals: 2,
                awayGoals: 1,
            },
        ] as unknown as (typeof schema.fixtures.$inferSelect)[]);

        const r = await fire(yoga, `query { fixtures(seasonId: "s1") { id goalsHome goalsAway } }`);
        const fixtures = r.data?.fixtures as Array<{
            id: string;
            goalsHome: number | null;
            goalsAway: number | null;
        }>;
        expect(fixtures[0].goalsHome).toBeNull();
        expect(fixtures[1].goalsHome).toBe(2);
        expect(fixtures[1].goalsAway).toBe(1);
    });

    it('Fixture.leagueSourceId returns null when seasonId is missing', async () => {
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue([
            { id: 'f1', seasonId: null, sourceId: 1, homeTeamId: 't1', awayTeamId: 't2' },
        ] as unknown as (typeof schema.fixtures.$inferSelect)[]);

        const r = await fire(yoga, `query { fixtures(seasonId: "s1") { id leagueSourceId } }`);
        const fixtures = r.data?.fixtures as Array<{ leagueSourceId: number | null }>;
        expect(fixtures[0].leagueSourceId).toBeNull();
    });
});

describe('player query — UUID ↔ sourceId resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves a player by internal UUID by looking up its sourceId first', async () => {
        vi.mocked(repository.players.getPlayerById).mockResolvedValue({
            id: 'p1',
            sourceId: 12345,
        } as unknown as typeof schema.players.$inferSelect);
        vi.mocked(repository.players.getPlayerData).mockResolvedValue({
            sourceId: 12345,
            name: 'M. Salah',
            metadata: { nationality: 'Egypt' },
        } as unknown as Awaited<ReturnType<typeof repository.players.getPlayerData>>);

        const r = await fire(yoga, `query { player(id: "p1", season: 2024) { name nationality } }`);
        const player = r.data?.player as { name: string; nationality: string };
        expect(player.name).toBe('M. Salah');
        expect(player.nationality).toBe('Egypt');
        expect(repository.players.getPlayerById).toHaveBeenCalledWith('p1');
        expect(repository.players.getPlayerData).toHaveBeenCalledWith(12345, 2024);
    });

    it('returns null when the UUID does not match a stored player', async () => {
        vi.mocked(repository.players.getPlayerById).mockResolvedValue(null);

        const r = await fire(yoga, `query { player(id: "ghost", season: 2024) { name } }`);
        expect(r.errors).toBeUndefined();
        expect(r.data?.player).toBeNull();
        expect(repository.players.getPlayerData).not.toHaveBeenCalled();
    });

    it('returns null when neither id nor sourceId is provided', async () => {
        const r = await fire(yoga, `query { player(season: 2024) { name } }`);
        expect(r.errors).toBeUndefined();
        expect(r.data?.player).toBeNull();
    });

    it('returns null when the provider returns no data for a known sourceId', async () => {
        vi.mocked(repository.players.getPlayerData).mockResolvedValue(null);

        const r = await fire(yoga, `query { player(sourceId: 99999, season: 2024) { name } }`);
        expect(r.errors).toBeUndefined();
        expect(r.data?.player).toBeNull();
    });
});

describe('importSquad mutation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('throws when the team UUID is not found, never calls importSquad on the repository', async () => {
        vi.mocked(repository.teams.getTeamById).mockResolvedValue(null);

        const adminYogaUnmasked = createYoga({
            schema: builder.toSchema(),
            maskedErrors: false,
            context: () => ({
                user: { id: 'admin-1', roles: ['admin'] },
                loaders: createLoaders(),
            }),
        });
        const res = await adminYogaUnmasked.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `mutation { importSquad(teamId: "ghost", seasonId: "s1") { id } }`,
            }),
        });
        const result = (await res.json()) as { errors?: Array<{ message: string }> };
        expect(result.errors?.[0]?.message).toMatch(/team not found/i);
        expect(repository.teams.importSquad).not.toHaveBeenCalled();
    });

    it('non-admin caller is rejected before the team lookup runs', async () => {
        const userYoga = createYoga({
            schema: builder.toSchema(),
            maskedErrors: false,
            context: () => ({ user: { id: 'u', roles: ['user'] }, loaders: createLoaders() }),
        });
        const r = await userYoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `mutation { importSquad(teamId: "t1", seasonId: "s1") { id } }`,
            }),
        });
        const result = (await r.json()) as { errors?: Array<{ message: string }> };
        expect(result.errors?.[0]?.message.toLowerCase()).toMatch(/forbidden|admin|unauthor/);
        expect(repository.teams.getTeamById).not.toHaveBeenCalled();
        expect(repository.teams.importSquad).not.toHaveBeenCalled();
    });

    it('happy path: looks up team, calls importSquad with sourceId, returns roster', async () => {
        vi.mocked(repository.teams.getTeamById).mockResolvedValue({
            id: 't1',
            sourceId: 42,
            name: 'Arsenal',
        } as unknown as typeof schema.teams.$inferSelect);
        vi.mocked(repository.teams.importSquad).mockResolvedValue([]);
        vi.mocked(repository.teams.getTeamRoster).mockResolvedValue([
            {
                id: 'r1',
                teamId: 't1',
                playerId: 'p1',
                seasonId: 's1',
                metadata: { squadNumber: 11 },
                createdAt: new Date(),
                updatedAt: new Date(),
                player: {
                    id: 'p1',
                    sourceId: 12345,
                    name: 'M. Salah',
                    metadata: { firstname: 'Mohamed' },
                },
            },
        ] as unknown as Awaited<ReturnType<typeof repository.teams.getTeamRoster>>);

        const r = await fire(
            adminYoga,
            `mutation { importSquad(teamId: "t1", seasonId: "s1") { id squadNumber player { name firstname } } }`,
        );
        expect(r.errors).toBeUndefined();
        const out = r.data?.importSquad as Array<{
            id: string;
            squadNumber: number;
            player: { name: string; firstname: string };
        }>;
        expect(out[0].squadNumber).toBe(11);
        expect(out[0].player.firstname).toBe('Mohamed');
        expect(repository.teams.importSquad).toHaveBeenCalledWith('t1', 42, 's1');
    });
});

describe('schema nullability — football schema currently treats scalars as nullable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Issue #54 calls out the absence of a nullability guard. The football
    // schema does not configure Pothos with the `defaultFieldNullability:
    // false` option, so every `t.exposeString` / `t.int` / `t.string` is in
    // fact nullable. This test PINS that observation — if someone later tightens
    // the schema (e.g. ID fields become non-null), this test will fail and they
    // can intentionally update it. That's the belt-and-braces guard from #54:
    // it forces a deliberate decision instead of a silent contract change.
    it('League.id, Season.id, Team.id, Fixture.id are currently SCALAR (nullable) per introspection', async () => {
        const r = await fire(
            yoga,
            `query {
                League: __type(name: "League") { fields { name type { kind name ofType { name } } } }
                Season: __type(name: "Season") { fields { name type { kind name ofType { name } } } }
                Team: __type(name: "Team") { fields { name type { kind name ofType { name } } } }
                Fixture: __type(name: "Fixture") { fields { name type { kind name ofType { name } } } }
            }`,
        );
        type TypeRef = { kind: string; name: string | null; ofType: { name: string } | null };
        type Type = { fields: Array<{ name: string; type: TypeRef }> };
        for (const name of ['League', 'Season', 'Team', 'Fixture'] as const) {
            const t = r.data?.[name] as Type | undefined;
            const idType = t?.fields.find((f) => f.name === 'id')?.type;
            expect(idType?.kind, `${name}.id kind`).toBe('SCALAR');
            expect(idType?.name).toBe('String');
        }
    });
});

describe('Pothos object refs registered for football schema', () => {
    it('all expected types and queries resolve through introspection', async () => {
        const r = await fire(
            yoga,
            `query { __schema { types { name } queryType { fields { name } } mutationType { fields { name } } } }`,
        );
        const types = ((r.data?.__schema as { types: Array<{ name: string }> }).types || []).map(
            (t) => t.name,
        );
        for (const required of [
            'League',
            'Team',
            'Season',
            'Fixture',
            'Venue',
            'Player',
            'Lineup',
            'MatchEvent',
            'RosterEntry',
            'RankingFormula',
            'SourceInfo',
        ]) {
            expect(types).toContain(required);
        }
        const queries = (
            (r.data?.__schema as { queryType: { fields: Array<{ name: string }> } }).queryType
                .fields || []
        ).map((f) => f.name);
        for (const q of [
            'leagues',
            'seasons',
            'allSeasons',
            'rankingFormulas',
            'fixtures',
            'fixture',
            'venues',
            'teams',
            'player',
            'teamRoster',
        ]) {
            expect(queries).toContain(q);
        }
    });
});
