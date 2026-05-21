import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { builder } from './builder';
import { repository } from '../repositories';

vi.mock('../db', () => ({
    db: {
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    },
}));

vi.mock('../workers/runner', () => ({
    JobRunner: {
        run: vi.fn().mockImplementation((_name: string, task: () => Promise<unknown>) => task()),
    },
}));

vi.mock('../services/graphics.service', () => ({
    graphicsService: { resolveUrl: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../repositories', () => ({
    repository: {
        leagues: {
            updateSeasonConfig: vi.fn().mockResolvedValue({ id: 'season-id', year: 2025, leagueId: 'league-id' }),
        },
    },
}));

// Register schema modules AFTER mocks so they pick up the mocked repository.
import './football';
import './catalog';

const yoga = createYoga({
    schema: builder.toSchema(),
    maskedErrors: false,
    context: () => ({ user: { id: 'admin', roles: ['admin'] } }),
});

async function callUpdateSeasonConfig(configJson: string) {
    const response = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `mutation($seasonId: String!, $configJson: String!) {
                updateSeasonConfig(seasonId: $seasonId, configJson: $configJson) { id }
            }`,
            variables: { seasonId: 'season-id', configJson },
        }),
    });
    return response.json() as Promise<{ data?: unknown; errors?: Array<{ message: string }> }>;
}

describe('updateSeasonConfig mutation', () => {
    beforeEach(() => {
        vi.mocked(repository.leagues.updateSeasonConfig).mockClear();
    });

    it('accepts a valid season config and forwards it to the repository', async () => {
        const valid = JSON.stringify({
            promotion: [1, 2],
            relegation: [18, 19, 20],
            deductions: [{ teamId: 'team-1', points: -4, reason: 'admin error' }],
        });
        const result = await callUpdateSeasonConfig(valid);
        expect(result.errors).toBeUndefined();
        expect(repository.leagues.updateSeasonConfig).toHaveBeenCalledWith(
            'season-id',
            expect.objectContaining({ promotion: [1, 2], relegation: [18, 19, 20] })
        );
    });

    it('rejects unknown top-level keys', async () => {
        const bad = JSON.stringify({ promotion: [1], rogue: 'value' });
        const result = await callUpdateSeasonConfig(bad);
        expect(result.errors).toBeDefined();
        expect(result.errors![0].message).toContain('Invalid season config');
        expect(repository.leagues.updateSeasonConfig).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON', async () => {
        const result = await callUpdateSeasonConfig('{not-json');
        expect(result.errors).toBeDefined();
        expect(result.errors![0].message).toContain('Invalid JSON');
        expect(repository.leagues.updateSeasonConfig).not.toHaveBeenCalled();
    });

    it('rejects malformed deduction entries', async () => {
        const bad = JSON.stringify({ deductions: [{ teamId: '', points: 'lots', reason: '' }] });
        const result = await callUpdateSeasonConfig(bad);
        expect(result.errors).toBeDefined();
        expect(result.errors![0].message).toContain('Invalid season config');
        expect(repository.leagues.updateSeasonConfig).not.toHaveBeenCalled();
    });
});
