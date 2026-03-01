import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { builder } from './builder';
import { repository } from '../repositories/supabase.repository';
import { db } from '../db';
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
vi.mock('../repositories/supabase.repository', () => ({
    repository: {
        football: {
            getLeagues: vi.fn(),
            getFixtures: vi.fn(),
            syncFixtures: vi.fn(),
            getInternalSeasons: vi.fn(),
            getAllInternalSeasons: vi.fn(),
        }
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
        vi.mocked(repository.football.getLeagues).mockResolvedValue(mockLeagues as unknown as typeof schema.leagues.$inferSelect[]);

        const response = await yoga.fetch('http://localhost:4000/graphql', {
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
        vi.mocked(repository.football.getFixtures).mockResolvedValue(mockFixtures as unknown as typeof schema.fixtures.$inferSelect[]);

        const since = "2026-02-21T00:00:00.000Z";
        const response = await yoga.fetch('http://localhost:4000/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query GetFixtures($since: DateTime) {
                        fixtures(leagueId: 39, season: 2024, since: $since) {
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
        expect(repository.football.getFixtures).toHaveBeenCalledWith(39, 2024, expect.any(Date));
    });

    it('should trigger syncFixtures mutation and track via JobRunner', async () => {
        // This test verifies the mutation wiring
        vi.mocked(repository.football.syncFixtures).mockResolvedValue({
            data: [{ id: 'mock-fixture' }] as unknown as typeof schema.fixtures.$inferSelect[],
            stats: { processedCount: 1, apiCallsCount: 1 }
        });

        const response = await yoga.fetch('http://localhost:4000/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    mutation Sync {
                        syncFixtures(leagueId: 39, season: 2024) {
                            id
                        }
                    }
                `
            })
        });

        const result = await response.json();
        expect(result.data.syncFixtures).toBeDefined();
        expect(repository.football.syncFixtures).toHaveBeenCalled();
    });

    it('should query season with teams and venue', async () => {
        const mockSeasons = [
            { id: 'season-1', year: 2024, leagueId: 'league-1', updatedAt: new Date().toISOString() }
        ];


        // Refined mock to handle sequential calls
        const m = vi.fn();
        m.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ id: 'league-1', sourceId: 39 }]),
                innerJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([{ team: { id: 'team-1', name: 'Arsenal', venueId: 'venue-1' } }])
                })
            })
        });

        // Also need to handle the count(*) call for teamCount
        m.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'league-1', sourceId: 39 }]) }) }); // league lookup
        m.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ val: 20 }]) }) }); // teamCount
        m.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ team: { id: 'team-1', name: 'Arsenal', venueId: 'venue-1' } }]) }) }) }); // teams field
        m.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'venue-1', name: 'Emirates Stadium' }]) }) }); // venue field (nested)

        vi.mocked(db.select).mockImplementation(m as unknown as typeof db.select);

        vi.mocked(repository.football.getInternalSeasons).mockResolvedValue(mockSeasons as unknown as typeof schema.seasons.$inferSelect[]);

        const response = await yoga.fetch('http://localhost:4000/graphql', {
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
        // Since we mock repository.football results, this mainly tests GraphQL wiring
        const result = await response.json();
        expect(result.data.seasons).toHaveLength(1);
        expect(result.data.seasons[0].year).toBe(2024);
    });
});
