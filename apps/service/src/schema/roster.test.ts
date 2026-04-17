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
        run: vi.fn().mockImplementation((_name: string, task: () => unknown) => task())
    }
}));

// Mock the repository
vi.mock('../repositories/supabase.repository', () => ({
    repository: {
        football: {
            getTeamRoster: vi.fn(),
            importSquad: vi.fn(),
            resolvePlayerBySourceId: vi.fn(),
            getLeagues: vi.fn(),
            getFixtures: vi.fn(),
            getFixturesBySeasonId: vi.fn(),
            getTeamsBySeasonId: vi.fn(),
            syncFixtures: vi.fn(),
            getInternalSeasons: vi.fn(),
            getAllInternalSeasons: vi.fn(),
        }
    }
}));

// Mock graphics service
vi.mock('../services/graphics.service', () => ({
    graphicsService: {
        resolveUrl: vi.fn().mockResolvedValue(null),
        registerFromUrl: vi.fn().mockResolvedValue(undefined),
    }
}));

const mockTeam = {
    id: 'team-uuid-1',
    name: 'Manchester United',
    shortName: 'Man Utd',
    tla: 'MUN',
    logo: 'https://example.com/mun.png',
    sourceId: 33,
    sourceName: 'api-football',
    venueId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockPlayer = {
    id: 'player-uuid-1',
    name: 'Marcus Rashford',
    sourceName: 'api-football',
    sourceId: 909,
    metadata: {
        firstname: 'Marcus',
        lastname: 'Rashford',
        age: 27,
        nationality: 'England',
        photo: 'https://example.com/rashford.png',
        injured: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockRosterEntry = {
    id: 'roster-uuid-1',
    teamId: 'team-uuid-1',
    playerId: 'player-uuid-1',
    seasonId: 'season-uuid-1',
    metadata: { squadNumber: 10, position: 'Attacker' },
    createdAt: new Date(),
    updatedAt: new Date(),
    player: mockPlayer,
};

describe('Team Roster', () => {
    const yoga = createYoga({ schema: builder.toSchema(), maskedErrors: false });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should query teamRoster and return roster entries with player data', async () => {
        vi.mocked(repository.football.getTeamRoster).mockResolvedValue([mockRosterEntry]);

        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query GetRoster($teamId: String!, $seasonId: String!) {
                        teamRoster(teamId: $teamId, seasonId: $seasonId) {
                            id
                            teamId
                            playerId
                            seasonId
                            squadNumber
                            position
                            player {
                                name
                                sourceId
                            }
                        }
                    }
                `,
                variables: { teamId: 'team-uuid-1', seasonId: 'season-uuid-1' }
            })
        });

        const result = await response.json() as { data: { teamRoster: Array<{ id: string; squadNumber: number; position: string; player: { name: string } }> } };
        expect(result.data.teamRoster).toHaveLength(1);
        expect(result.data.teamRoster[0].squadNumber).toBe(10);
        expect(result.data.teamRoster[0].position).toBe('Attacker');
        expect(result.data.teamRoster[0].player.name).toBe('Marcus Rashford');
        expect(repository.football.getTeamRoster).toHaveBeenCalledWith('team-uuid-1', 'season-uuid-1');
    });

    it('should return empty array for unknown team roster', async () => {
        vi.mocked(repository.football.getTeamRoster).mockResolvedValue([]);

        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query {
                        teamRoster(teamId: "nonexistent", seasonId: "nonexistent") {
                            id
                        }
                    }
                `
            })
        });

        const result = await response.json() as { data: { teamRoster: unknown[] } };
        expect(result.data.teamRoster).toHaveLength(0);
    });

    it('should handle roster metadata with null values gracefully', async () => {
        const entryWithNullMeta = {
            ...mockRosterEntry,
            metadata: null, // No metadata at all
        };
        vi.mocked(repository.football.getTeamRoster).mockResolvedValue([entryWithNullMeta]);

        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query {
                        teamRoster(teamId: "team-uuid-1", seasonId: "season-uuid-1") {
                            squadNumber
                            position
                        }
                    }
                `
            })
        });

        const result = await response.json() as { data: { teamRoster: Array<{ squadNumber: number | null; position: string | null }> } };
        expect(result.data.teamRoster[0].squadNumber).toBeNull();
        expect(result.data.teamRoster[0].position).toBeNull();
    });

    it('should require admin for importSquad mutation', async () => {
        // Create Yoga without any user context (guest)
        const guestYoga = createYoga({
            schema: builder.toSchema(),
            maskedErrors: false,
            context: () => ({ user: undefined }),
        });

        const response = await guestYoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    mutation {
                        importSquad(teamId: "team-uuid-1", seasonId: "season-uuid-1") {
                            id
                        }
                    }
                `
            })
        });

        const result = await response.json() as { errors?: Array<{ message: string }> };
        // Should fail without auth
        expect(result.errors).toBeDefined();
        expect(result.errors![0].message).toContain('Unauthenticated');
    });

    it('should handle importSquad with admin auth', async () => {
        // Create Yoga with admin context
        const adminYoga = createYoga({
            schema: builder.toSchema(),
            maskedErrors: false,
            context: () => ({ user: { id: 'admin-1', roles: ['admin'] } }),
        });

        // Mock the db.select for the team lookup
        const mockSelect = vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([mockTeam])
            })
        });
        vi.mocked(db.select).mockImplementation(mockSelect);

        vi.mocked(repository.football.importSquad).mockResolvedValue([]);
        vi.mocked(repository.football.getTeamRoster).mockResolvedValue([mockRosterEntry]);

        const response = await adminYoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    mutation {
                        importSquad(teamId: "team-uuid-1", seasonId: "season-uuid-1") {
                            id
                            squadNumber
                            player {
                                name
                            }
                        }
                    }
                `
            })
        });

        const result = await response.json() as { data?: { importSquad: Array<{ id: string; squadNumber: number; player: { name: string } }> }; errors?: Array<{ message: string }> };
        expect(result.errors).toBeUndefined();
        expect(result.data!.importSquad).toHaveLength(1);
        expect(result.data!.importSquad[0].squadNumber).toBe(10);
        expect(result.data!.importSquad[0].player.name).toBe('Marcus Rashford');
    });
});

describe('RosterEntry schema descriptions', () => {
    const gqlSchema = builder.toSchema();

    it('RosterEntry type and all fields should have descriptions', async () => {
        const yoga = createYoga({ schema: gqlSchema });
        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `{
                    __type(name: "RosterEntry") {
                        description
                        fields {
                            name
                            description
                        }
                    }
                }`
            })
        });

        const result = await response.json() as { data: { __type: { description: string; fields: Array<{ name: string; description: string }> } } };
        const type = result.data.__type;
        expect(type.description).toBeTruthy();

        for (const field of type.fields) {
            expect(field.description, `RosterEntry.${field.name} missing description`).toBeTruthy();
        }
    });

    it('teamRoster query and importSquad mutation should have descriptions', async () => {
        const yoga = createYoga({ schema: gqlSchema });
        const response = await yoga.fetch('http://localhost:8080/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `{
                    query: __type(name: "Query") {
                        fields {
                            name
                            description
                        }
                    }
                    mutation: __type(name: "Mutation") {
                        fields {
                            name
                            description
                        }
                    }
                }`
            })
        });

        const result = await response.json() as {
            data: {
                query: { fields: Array<{ name: string; description: string }> };
                mutation: { fields: Array<{ name: string; description: string }> };
            }
        };

        const teamRosterQuery = result.data.query.fields.find(f => f.name === 'teamRoster');
        expect(teamRosterQuery, 'teamRoster query not found').toBeDefined();
        expect(teamRosterQuery!.description).toBeTruthy();

        const importSquadMutation = result.data.mutation.fields.find(f => f.name === 'importSquad');
        expect(importSquadMutation, 'importSquad mutation not found').toBeDefined();
        expect(importSquadMutation!.description).toBeTruthy();
    });
});
