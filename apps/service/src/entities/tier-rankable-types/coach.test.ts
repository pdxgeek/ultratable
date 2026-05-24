/**
 * Coach recipe unit tests. Pins the projection contract: every required
 * tier-rankable-item field is populated, the natural key is
 * `<teamId>|<lowercased name>`, and the source pointer captures the
 * fixture id + lineup selector.
 */
import { describe, expect, it, vi } from 'vitest';

import { coachRecipe, type CoachSourceRow } from './coach';
import type { RecipeContext } from './recipe';

const FIXTURE_ID = '00000000-0000-0000-0000-0000000000e1';
const TEAM_ID = '00000000-0000-0000-0000-0000000000d1';
const TEAM_SOURCE_ID = 50;
const SOURCE_NAME = 'api-football';

function ctxWithTeam(teamId: string | null = TEAM_ID): RecipeContext {
    return {
        resolveTeamIdsBySource: vi.fn(async (_src, ids) => {
            const map = new Map<number, string>();
            if (teamId) for (const id of ids) map.set(id, teamId);
            return map;
        }),
    };
}

function source(overrides: Partial<CoachSourceRow> = {}): CoachSourceRow {
    return {
        fixtureId: FIXTURE_ID,
        teamSourceId: TEAM_SOURCE_ID,
        sourceName: SOURCE_NAME,
        coachName: 'Pep Guardiola',
        coachPhoto: 'https://example.com/pep.png',
        ...overrides,
    };
}

describe('coachRecipe', () => {
    it('registers as the coach recipe over fixture lineups', () => {
        expect(coachRecipe.id).toBe('coach');
        expect(coachRecipe.name).toBe('Coach');
        expect(coachRecipe.sourceType).toBe('fixture');
    });

    it('projects all required item fields', async () => {
        const result = await coachRecipe.project(source(), ctxWithTeam());
        expect(result).toEqual({
            name: 'Pep Guardiola',
            imageUrl: 'https://example.com/pep.png',
            teamId: TEAM_ID,
            naturalKey: `${TEAM_ID}|pep guardiola`,
            sourceType: 'fixture',
            sourceId: FIXTURE_ID,
            sourcePath: { teamSourceId: TEAM_SOURCE_ID, sourceName: SOURCE_NAME },
        });
    });

    it('normalises name into the natural key (trim + lowercase)', async () => {
        const result = await coachRecipe.project(
            source({ coachName: '  Pep GUARDIOLA  ' }),
            ctxWithTeam(),
        );
        expect(result.name).toBe('Pep GUARDIOLA');
        expect(result.naturalKey).toBe(`${TEAM_ID}|pep guardiola`);
    });

    it('dedups two callers with the same coach + team (same naturalKey)', async () => {
        const a = await coachRecipe.project(source(), ctxWithTeam());
        const b = await coachRecipe.project(source(), ctxWithTeam());
        expect(a.naturalKey).toBe(b.naturalKey);
    });

    it('throws when the source lineup has no coachName', async () => {
        await expect(
            coachRecipe.project(source({ coachName: null }), ctxWithTeam()),
        ).rejects.toThrow(/no coachName/);
    });

    it('throws when the teamSourceId has no local team mapping', async () => {
        await expect(
            coachRecipe.project(source(), ctxWithTeam(null)),
        ).rejects.toThrow(/no local team/);
    });

    it('uses the supplied reverse-lookup helper (no repo coupling)', async () => {
        const ctx = ctxWithTeam();
        await coachRecipe.project(source(), ctx);
        expect(ctx.resolveTeamIdsBySource).toHaveBeenCalledWith(SOURCE_NAME, [TEAM_SOURCE_ID]);
    });
});
