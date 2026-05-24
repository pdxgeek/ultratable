/**
 * Coach recipe unit tests. Pins the projection contract: every required
 * tier-rankable-item field is populated, the natural key is
 * `<teamId>|<lowercased name>`, and the source pointer captures the
 * coach UUID.
 */
import { describe, expect, it } from 'vitest';

import { coachRecipe, type CoachSourceRow } from './coach';
import type { RecipeContext } from './recipe';

const COACH_ID = '00000000-0000-0000-0000-0000000000c1';
const TEAM_ID = '00000000-0000-0000-0000-0000000000d1';

// The coach recipe doesn't need a reverse team lookup any more —
// teams are pre-resolved by the caller. A throwing helper proves the
// recipe stays decoupled from team resolution.
const NOOP_CTX: RecipeContext = {
    resolveTeamIdsBySource: async () => {
        throw new Error('coach recipe must not call resolveTeamIdsBySource');
    },
};

function source(overrides: Partial<CoachSourceRow> = {}): CoachSourceRow {
    return {
        coachId: COACH_ID,
        teamId: TEAM_ID,
        name: 'Pep Guardiola',
        photo: 'https://example.com/pep.png',
        ...overrides,
    };
}

describe('coachRecipe', () => {
    it('registers as the coach recipe over coach source rows', () => {
        expect(coachRecipe.id).toBe('coach');
        expect(coachRecipe.name).toBe('Coach');
        expect(coachRecipe.sourceType).toBe('coach');
    });

    it('projects all required item fields', async () => {
        const result = await coachRecipe.project(source(), NOOP_CTX);
        expect(result).toEqual({
            name: 'Pep Guardiola',
            imageUrl: 'https://example.com/pep.png',
            teamId: TEAM_ID,
            naturalKey: `${TEAM_ID}|pep guardiola`,
            sourceType: 'coach',
            sourceId: COACH_ID,
            sourcePath: null,
        });
    });

    it('normalises name into the natural key (trim + lowercase)', async () => {
        const result = await coachRecipe.project(
            source({ name: '  Pep GUARDIOLA  ' }),
            NOOP_CTX,
        );
        expect(result.name).toBe('Pep GUARDIOLA');
        expect(result.naturalKey).toBe(`${TEAM_ID}|pep guardiola`);
    });

    it('dedups two callers with the same coach + team (same naturalKey)', async () => {
        const a = await coachRecipe.project(source(), NOOP_CTX);
        const b = await coachRecipe.project(source(), NOOP_CTX);
        expect(a.naturalKey).toBe(b.naturalKey);
    });

    it('passes through null photo gracefully', async () => {
        const result = await coachRecipe.project(source({ photo: null }), NOOP_CTX);
        expect(result.imageUrl).toBeNull();
    });

    it('throws when the source coach has no name', async () => {
        await expect(
            coachRecipe.project(source({ name: '   ' }), NOOP_CTX),
        ).rejects.toThrow(/no name/);
    });
});
