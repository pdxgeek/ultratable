/**
 * Team recipe unit tests. Pins the projection contract: the team UUID
 * is the natural key, the team logo is the image, and teamId is
 * deliberately null (the universal renderer would double up otherwise
 * — the thumbnail IS the team crest).
 */
import { describe, expect, it } from 'vitest';

import type { RecipeContext } from './recipe';
import { teamRecipe, type TeamSourceRow } from './team';

const TEAM_ID = '00000000-0000-0000-0000-0000000000a1';

const NOOP_CTX: RecipeContext = {
    resolveTeamIdsBySource: async () => {
        throw new Error('team recipe must not call resolveTeamIdsBySource');
    },
};

function source(overrides: Partial<TeamSourceRow> = {}): TeamSourceRow {
    return {
        teamId: TEAM_ID,
        name: 'Manchester United',
        logo: 'https://example.com/mun.png',
        ...overrides,
    };
}

describe('teamRecipe', () => {
    it('registers as the team recipe over team rows', () => {
        expect(teamRecipe.id).toBe('team');
        expect(teamRecipe.name).toBe('Team');
        expect(teamRecipe.sourceType).toBe('team');
    });

    it('projects all required item fields with teamId left null', async () => {
        const result = await teamRecipe.project(source(), NOOP_CTX);
        expect(result).toEqual({
            name: 'Manchester United',
            imageUrl: 'https://example.com/mun.png',
            teamId: null,
            naturalKey: TEAM_ID,
            sourceType: 'team',
            sourceId: TEAM_ID,
            sourcePath: null,
        });
    });

    it('trims the name but keeps the natural key as the bare team UUID', async () => {
        const result = await teamRecipe.project(
            source({ name: '  Manchester United  ' }),
            NOOP_CTX,
        );
        expect(result.name).toBe('Manchester United');
        expect(result.naturalKey).toBe(TEAM_ID);
    });

    it('passes through null logo gracefully', async () => {
        const result = await teamRecipe.project(source({ logo: null }), NOOP_CTX);
        expect(result.imageUrl).toBeNull();
    });

    it('throws when the team has no name', async () => {
        await expect(
            teamRecipe.project(source({ name: '   ' }), NOOP_CTX),
        ).rejects.toThrow(/no name/);
    });
});
