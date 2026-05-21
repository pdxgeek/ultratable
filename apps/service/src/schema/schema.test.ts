/**
 * GraphQL schema integration tests.
 *
 * These tests boot the real Pothos schema + a `yoga` HTTP wrapper and exercise
 * queries/mutations. The repository is replaced by a *type-checked* mock
 * (see `repositories/__fixtures__/mockRepository.ts`) so that:
 *
 *   - Adding a method to IRepository fails compilation here, not at runtime.
 *   - Per-test overrides use `vi.mocked(repository.x.y).mockResolvedValue(...)`
 *     which preserves the real method signature — passing wrong-shaped args
 *     to mockResolvedValue is a compile error.
 *
 * This guards against the failure mode from #14 (a third arg added to
 * `getFixturesBySeasonId` was missed by the loose mock).
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema';
import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { builder } from './builder';

import './football'; // Ensure football schema is registered

// Mock the database (Drizzle calls inside un-stubbed code paths must not crash).
vi.mock('../db', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    },
}));

// Mock JobRunner so `syncFixtures` mutation runs its task body synchronously
// and we can assert on the wired-up repository call.
vi.mock('../workers/runner', () => ({
    JobRunner: {
        run: vi.fn().mockImplementation((_name: string, task: () => Promise<unknown>) => task()),
    },
}));

// Replace the repository singleton with a *type-checked* mock. The async
// factory lets us import the helper through Vite's TS resolver (require()
// from a hoisted block can't resolve `.ts` files).
vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

describe('GraphQL Schema', () => {
    // Wire DataLoaders into the request context so nested resolvers (Team.venue,
    // Fixture.homeTeam, etc.) don't crash with "Cannot read properties of
    // undefined (reading 'venueLoader')" — that crash was the symptom cited in
    // issue #50 and is what the new loaders/index.test.ts pins.
    const yoga = createYoga({
        schema: builder.toSchema(),
        context: () => ({ loaders: createLoaders() }),
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should query leagues', async () => {
        const mockLeagues = [
            {
                id: '1',
                name: 'Premier League',
                slug: 'pl',
                sourceName: 'api-football',
                sourceId: 39,
            },
        ];
        vi.mocked(repository.leagues.getLeagues).mockResolvedValue(
            mockLeagues as unknown as (typeof schema.leagues.$inferSelect)[],
        );

        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query {
                        leagues {
                            id
                            name
                            metadata {
                                sourceName
                                sourceId
                            }
                        }
                    }
                `,
            }),
        });

        const result = await response.json();
        expect(result.data.leagues).toHaveLength(1);
        expect(result.data.leagues[0].name).toBe('Premier League');
        expect(result.data.leagues[0].metadata.sourceId).toBe(39);
    });

    it('should query fixtures with delta sync (since)', async () => {
        const mockFixtures = [
            {
                id: '1',
                scheduledAt: new Date().toISOString(),
                status: 'scheduled',
                updatedAt: new Date().toISOString(),
                sourceName: 'api-football',
                sourceId: 101,
            },
        ];
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue(
            mockFixtures as unknown as (typeof schema.fixtures.$inferSelect)[],
        );

        const since = '2026-02-21T00:00:00.000Z';
        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query GetFixtures($since: DateTime) {
                        fixtures(seasonId: "season-uuid-1", since: $since) {
                            id
                            status
                            updatedAt
                        }
                    }
                `,
                variables: { since },
            }),
        });

        const result = await response.json();
        expect(result.data.fixtures).toHaveLength(1);
        // Third arg (forceRefresh) was added in #14 — typed mock catches if it disappears.
        expect(repository.fixtures.getFixturesBySeasonId).toHaveBeenCalledWith(
            'season-uuid-1',
            expect.any(Date),
            undefined,
        );
    });

    it('forceRefresh arg is forwarded from query to repository', async () => {
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue([]);

        await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query { fixtures(seasonId: "s1", forceRefresh: true) { id } }
                `,
            }),
        });

        expect(repository.fixtures.getFixturesBySeasonId).toHaveBeenCalledWith(
            's1',
            undefined,
            true,
        );
    });

    it('should trigger syncFixtures mutation and track via JobRunner', async () => {
        vi.mocked(repository.fixtures.syncFixtures).mockResolvedValue({
            data: [{ id: 'mock-fixture' }] as unknown as (typeof schema.fixtures.$inferSelect)[],
            stats: { processedCount: 1, apiCallsCount: 1 },
        });

        const adminYoga = createYoga({
            schema: builder.toSchema(),
            context: () => ({
                user: { id: 'admin-test', roles: ['admin'] },
            }),
        });

        const response = await adminYoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    mutation Sync {
                        syncFixtures(leagueSourceId: 39, seasonYear: 2024) {
                            id
                        }
                    }
                `,
            }),
        });

        const result = await response.json();
        expect(result.data.syncFixtures).toBeDefined();
        expect(repository.fixtures.syncFixtures).toHaveBeenCalled();
    });

    it('non-admin cannot call admin-gated mutations (saveLeagueConfig)', async () => {
        const userYoga = createYoga({
            schema: builder.toSchema(),
            maskedErrors: false,
            context: () => ({ user: { id: 'u1', roles: ['user'] } }),
        });

        const response = await userYoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `mutation { saveLeagueConfig(id: "league-1", configJson: "{}") { id } }`,
            }),
        });

        const result = await response.json();
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message.toLowerCase()).toMatch(/forbidden|admin|unauthor/);
        // The mutation must not have been forwarded to the repository.
        expect(repository.leagues.updateLeagueConfig).not.toHaveBeenCalled();
    });

    it('admin can call saveLeagueConfig and the parsed JSON reaches the repository', async () => {
        vi.mocked(repository.leagues.updateLeagueConfig).mockResolvedValue({
            id: 'league-1',
            name: 'Premier League',
            sourceId: 39,
        } as unknown as typeof schema.leagues.$inferSelect);

        const adminYoga = createYoga({
            schema: builder.toSchema(),
            context: () => ({ user: { id: 'admin-1', roles: ['admin'] } }),
        });

        const response = await adminYoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `mutation { saveLeagueConfig(id: "league-1", configJson: "{\\"promo\\":2}") { id name } }`,
            }),
        });

        const result = await response.json();
        expect(result.errors).toBeUndefined();
        expect(result.data.saveLeagueConfig.id).toBe('league-1');
        expect(repository.leagues.updateLeagueConfig).toHaveBeenCalledWith('league-1', {
            promo: 2,
        });
    });

    it('saveLeagueConfig rejects malformed JSON before hitting the repository', async () => {
        const adminYoga = createYoga({
            schema: builder.toSchema(),
            maskedErrors: false,
            context: () => ({ user: { id: 'admin-1', roles: ['admin'] } }),
        });

        const response = await adminYoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `mutation { saveLeagueConfig(id: "league-1", configJson: "not-json") { id } }`,
            }),
        });

        const result = await response.json();
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toMatch(/Invalid JSON/);
        expect(repository.leagues.updateLeagueConfig).not.toHaveBeenCalled();
    });

    it('should query season with teams and venue', async () => {
        const mockSeasons = [
            {
                id: 'season-1',
                year: 2024,
                leagueId: 'league-1',
                updatedAt: new Date().toISOString(),
            },
        ];

        vi.mocked(repository.leagues.getLeagueById).mockResolvedValue({
            id: 'league-1',
            sourceId: 39,
        } as unknown as typeof schema.leagues.$inferSelect);
        vi.mocked(repository.leagues.getInternalSeasons).mockResolvedValue(
            mockSeasons as unknown as (typeof schema.seasons.$inferSelect)[],
        );
        vi.mocked(repository.teams.countTeamsInSeason).mockResolvedValue(20);
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue([
            { id: 'team-1', name: 'Arsenal', venueId: 'venue-1' },
        ] as unknown as (typeof schema.teams.$inferSelect)[]);
        vi.mocked(repository.teams.getVenuesByIds).mockResolvedValue([
            { id: 'venue-1', name: 'Emirates Stadium' },
        ] as unknown as (typeof schema.venues.$inferSelect)[]);

        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query {
                        seasons(leagueId: "some-uuid") {
                            id
                            year
                            teamCount
                            teams {
                                name
                                venue {
                                    name
                                }
                            }
                        }
                    }
                `,
            }),
        });

        const result = await response.json();
        expect(result.data.seasons).toHaveLength(1);
        expect(result.data.seasons[0].year).toBe(2024);
    });

    // Viewer-query auth semantics (null when unauthenticated, joined shape when
    // authenticated) are pinned by schema/viewer.test.ts. requireAdmin-gated
    // mutations and admin queries are pinned by schema/rbac.test.ts.

    describe('venues query', () => {
        const setupVenueMocks = () => {
            const mockVenues = [
                { id: 'v1', name: 'Emirates', city: 'London', updatedAt: '2026-03-01T00:00:00Z' },
                { id: 'v2', name: 'Anfield', city: 'Liverpool', updatedAt: '2026-03-03T00:00:00Z' },
            ];
            vi.mocked(repository.teams.getVenuesBySeasonId).mockResolvedValue(
                mockVenues as unknown as (typeof schema.venues.$inferSelect)[],
            );
            return mockVenues;
        };

        it('should return all venues without since', async () => {
            setupVenueMocks();

            const response = await yoga.fetch('http://localhost:8080/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `query { venues(seasonId: "season-uuid-1") { id name } }`,
                }),
            });

            const result = await response.json();
            expect(result.data.venues).toHaveLength(2);
            expect(result.data.venues[0].name).toBe('Emirates');
        });

        it('should accept since arg for delta sync', async () => {
            setupVenueMocks();

            const response = await yoga.fetch('http://localhost:8080/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `query($since: DateTime) { venues(seasonId: "season-uuid-1", since: $since) { id name } }`,
                    variables: { since: '2026-03-02T00:00:00Z' },
                }),
            });

            const result = await response.json();
            expect(result.data.venues).toBeDefined();
            expect(result.errors).toBeUndefined();
        });
    });
});
