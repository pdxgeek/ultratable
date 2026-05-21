import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { builder } from './builder';
import { repository } from '../repositories';
import * as schema from '../db/schema';

import './football'; // Ensure football schema is registered

// Mock the database
vi.mock('../db', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    }
}));

// Mock JobRunner
vi.mock('../workers/runner', () => ({
    JobRunner: {
        run: vi.fn().mockImplementation((name, task) => task())
    }
}));

// Mock the repository
vi.mock('../repositories', () => ({
    repository: {
        leagues: {
            getLeagues: vi.fn(),
            getLeagueById: vi.fn(),
            getInternalSeasons: vi.fn(),
            getAllInternalSeasons: vi.fn(),
        },
        teams: {
            getTeamsBySeasonId: vi.fn(),
            getVenuesByIds: vi.fn(),
            getVenuesBySeasonId: vi.fn(),
            countTeamsInSeason: vi.fn(),
        },
        fixtures: {
            getFixtures: vi.fn(),
            getFixturesBySeasonId: vi.fn(),
            syncFixtures: vi.fn(),
            countFixturesInSeason: vi.fn(),
        },
    }
}));

describe('GraphQL Schema', () => {
    const yoga = createYoga({ schema: builder.toSchema() });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should query leagues', async () => {
        const mockLeagues = [
            { id: '1', name: 'Premier League', slug: 'pl', sourceName: 'api-football', sourceId: 39 }
        ];
        vi.mocked(repository.leagues.getLeagues).mockResolvedValue(mockLeagues as unknown as typeof schema.leagues.$inferSelect[]);

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
                `
            })
        });

        const result = await response.json();
        expect(result.data.leagues).toHaveLength(1);
        expect(result.data.leagues[0].name).toBe('Premier League');
        expect(result.data.leagues[0].metadata.sourceId).toBe(39);
    });

    it('should query fixtures with delta sync (since)', async () => {
        const mockFixtures = [
            { id: '1', scheduledAt: new Date().toISOString(), status: 'scheduled', updatedAt: new Date().toISOString(), sourceName: 'api-football', sourceId: 101 }
        ];
        vi.mocked(repository.fixtures.getFixturesBySeasonId).mockResolvedValue(mockFixtures as unknown as typeof schema.fixtures.$inferSelect[]);

        const since = "2026-02-21T00:00:00.000Z";
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
                variables: { since }
            })
        });

        const result = await response.json();
        expect(result.data.fixtures).toHaveLength(1);
        expect(repository.fixtures.getFixturesBySeasonId).toHaveBeenCalledWith('season-uuid-1', expect.any(Date), undefined);
    });

    it('should trigger syncFixtures mutation and track via JobRunner', async () => {
        // This test verifies the mutation wiring
        vi.mocked(repository.fixtures.syncFixtures).mockResolvedValue({
            data: [{ id: 'mock-fixture' }] as unknown as typeof schema.fixtures.$inferSelect[],
            stats: { processedCount: 1, apiCallsCount: 1 }
        });

        // Mutations now require admin — create a yoga instance with admin context
        const adminYoga = createYoga({
            schema: builder.toSchema(),
            context: () => ({
                user: { id: 'admin-test', roles: ['admin'] }
            })
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
                `
            })
        });

        const result = await response.json();
        expect(result.data.syncFixtures).toBeDefined();
        expect(repository.fixtures.syncFixtures).toHaveBeenCalled();
    });

    it('should query season with teams and venue', async () => {
        const mockSeasons = [
            { id: 'season-1', year: 2024, leagueId: 'league-1', updatedAt: new Date().toISOString() }
        ];

        vi.mocked(repository.leagues.getLeagueById).mockResolvedValue({ id: 'league-1', sourceId: 39 } as unknown as typeof schema.leagues.$inferSelect);
        vi.mocked(repository.leagues.getInternalSeasons).mockResolvedValue(mockSeasons as unknown as typeof schema.seasons.$inferSelect[]);
        vi.mocked(repository.teams.countTeamsInSeason).mockResolvedValue(20);
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(
            [{ id: 'team-1', name: 'Arsenal', venueId: 'venue-1' }] as unknown as typeof schema.teams.$inferSelect[]
        );
        vi.mocked(repository.teams.getVenuesByIds).mockResolvedValue(
            [{ id: 'venue-1', name: 'Emirates Stadium' }] as unknown as typeof schema.venues.$inferSelect[]
        );

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
                `
            })
        });

        // Note: For full integration testing we need a real DB or more complex mocks
        // Since we mock the repository results, this mainly tests GraphQL wiring
        const result = await response.json();
        expect(result.data.seasons).toHaveLength(1);
        expect(result.data.seasons[0].year).toBe(2024);
    });

    describe('RBAC Authorization', () => {
        it('should reject unauthenticated requests to protected endpoints', async () => {
            const yoga = createYoga({
                schema: builder.toSchema(),
                maskedErrors: false,
                context: () => ({ user: undefined })
            });
            const response = await yoga.fetch('http://localhost:8080/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `{ me }` })
            });

            const result = await response.json();
            expect(result.errors).toBeDefined();
            expect(result.errors[0].message).toContain('Unauthenticated');
        });

        it('should allow authenticated users and expose their basic role', async () => {
            // Mock a yoga context that forces a user payload
            const yoga = createYoga({
                schema: builder.toSchema(),
                context: () => ({
                    user: { id: 'user-123', roles: ['user'] }
                })
            });

            const response = await yoga.fetch('http://localhost:8080/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `{ me }` })
            });

            const result = await response.json();
            expect(result.errors).toBeUndefined();
            expect(result.data.me).toBe('Authenticated as user user-123 with roles user');
        });

        it('should allow admin roles correctly', async () => {
            const yoga = createYoga({
                schema: builder.toSchema(),
                context: () => ({
                    user: { id: 'admin-456', roles: ['user', 'admin'] }
                })
            });

            const response = await yoga.fetch('http://localhost:8080/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `{ me }` })
            });

            const result = await response.json();
            expect(result.errors).toBeUndefined();
            expect(result.data.me).toBe('Authenticated as user admin-456 with roles user, admin');
        });
    });

    describe('venues query', () => {
        const setupVenueMocks = () => {
            const mockVenues = [
                { id: 'v1', name: 'Emirates', city: 'London', updatedAt: '2026-03-01T00:00:00Z' },
                { id: 'v2', name: 'Anfield', city: 'Liverpool', updatedAt: '2026-03-03T00:00:00Z' },
            ];
            vi.mocked(repository.teams.getVenuesBySeasonId).mockResolvedValue(
                mockVenues as unknown as typeof schema.venues.$inferSelect[]
            );
            return mockVenues;
        };

        it('should return all venues without since', async () => {
            setupVenueMocks();

            const response = await yoga.fetch('http://localhost:8080/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `query { venues(seasonId: "season-uuid-1") { id name } }`
                })
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
                    variables: { since: '2026-03-02T00:00:00Z' }
                })
            });

            const result = await response.json();
            expect(result.data.venues).toBeDefined();
            expect(result.errors).toBeUndefined();
        });
    });
});
