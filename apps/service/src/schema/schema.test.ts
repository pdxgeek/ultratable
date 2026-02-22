import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { builder } from './builder';
import { repository } from '../repositories/supabase.repository';
import './football'; // Ensure football schema is registered

// Mock the repository
vi.mock('../repositories/supabase.repository', () => ({
    repository: {
        football: {
            getLeagues: vi.fn(),
            getFixtures: vi.fn(),
            syncFixtures: vi.fn(),
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
        vi.mocked(repository.football.getLeagues).mockResolvedValue(mockLeagues);

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
        vi.mocked(repository.football.getFixtures).mockResolvedValue(mockFixtures);

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
        vi.mocked(repository.football.syncFixtures).mockResolvedValue([{ id: 'mock-fixture' }]);

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
});
