import { describe, it, expect } from 'vitest';
import { FORMULA_REGISTRY, compareByCriteria } from './formulas';
import type { StandingsRow } from './formulas';
import type { Fixture } from '../db';

function makeRow(overrides: Partial<StandingsRow> & { teamId: string }): StandingsRow {
    return {
        position: 0,
        team: { name: overrides.teamId },
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        form: [], recentFixtures: [], nextFixture: null,
        description: null, lastRefreshed: '',
        ...overrides
    };
}

describe('FORMULA_REGISTRY', () => {
    describe('standard / points', () => {
        it('ranks higher-point team first', () => {
            const a = makeRow({ teamId: 'a', points: 30 });
            const b = makeRow({ teamId: 'b', points: 25 });
            expect(FORMULA_REGISTRY.standard(a, b, [])).toBeLessThan(0); // b - a = negative → a wins
            expect(FORMULA_REGISTRY.points(a, b, [])).toBeLessThan(0);
        });

        it('returns 0 for equal points', () => {
            const a = makeRow({ teamId: 'a', points: 20 });
            const b = makeRow({ teamId: 'b', points: 20 });
            expect(FORMULA_REGISTRY.standard(a, b, [])).toBe(0);
        });
    });

    describe('goalDiff', () => {
        it('ranks by goal difference', () => {
            const a = makeRow({ teamId: 'a', goalDifference: 15 });
            const b = makeRow({ teamId: 'b', goalDifference: 10 });
            expect(FORMULA_REGISTRY.goalDiff(a, b, [])).toBeLessThan(0);
        });
    });

    describe('wins', () => {
        it('ranks by wins', () => {
            const a = makeRow({ teamId: 'a', won: 12 });
            const b = makeRow({ teamId: 'b', won: 8 });
            expect(FORMULA_REGISTRY.wins(a, b, [])).toBeLessThan(0);
        });
    });

    describe('goalsFor', () => {
        it('ranks by goals scored', () => {
            const a = makeRow({ teamId: 'a', goalsFor: 50 });
            const b = makeRow({ teamId: 'b', goalsFor: 40 });
            expect(FORMULA_REGISTRY.goalsFor(a, b, [])).toBeLessThan(0);
        });
    });

    describe('headToHead', () => {
        it('calculates h2h points from fixtures', () => {
            const a = makeRow({ teamId: 'a' });
            const b = makeRow({ teamId: 'b' });
            const fixtures: Fixture[] = [
                { id: 'f1', seasonId: 's1', homeTeamId: 'a', awayTeamId: 'b', scheduledAt: '', status: 'played', goalsHome: 2, goalsAway: 1, updatedAt: '' },
                { id: 'f2', seasonId: 's1', homeTeamId: 'b', awayTeamId: 'a', scheduledAt: '', status: 'played', goalsHome: 1, goalsAway: 1, updatedAt: '' },
            ];
            // a: 3 (win) + 1 (draw) = 4, b: 0 + 1 = 1 → bPoints - aPoints = 1 - 4 = -3
            expect(FORMULA_REGISTRY.headToHead(a, b, fixtures)).toBeLessThan(0);
        });

        it('returns 0 when no h2h matches exist', () => {
            const a = makeRow({ teamId: 'a' });
            const b = makeRow({ teamId: 'b' });
            expect(FORMULA_REGISTRY.headToHead(a, b, [])).toBe(0);
        });

        it('ignores non-played fixtures', () => {
            const a = makeRow({ teamId: 'a' });
            const b = makeRow({ teamId: 'b' });
            const fixtures: Fixture[] = [
                { id: 'f1', seasonId: 's1', homeTeamId: 'a', awayTeamId: 'b', scheduledAt: '', status: 'scheduled', goalsHome: 0, goalsAway: 0, updatedAt: '' },
            ];
            expect(FORMULA_REGISTRY.headToHead(a, b, fixtures)).toBe(0);
        });

        it('handles undefined goals in h2h', () => {
            const a = makeRow({ teamId: 'a' });
            const b = makeRow({ teamId: 'b' });
            const fixtures: Fixture[] = [
                { id: 'f1', seasonId: 's1', homeTeamId: 'a', awayTeamId: 'b', scheduledAt: '', status: 'played', updatedAt: '' } as Fixture,
            ];
            expect(FORMULA_REGISTRY.headToHead(a, b, fixtures)).toBe(0);
        });
    });
});

describe('compareByCriteria', () => {
    it('applies criteria in order, stopping at first decisive one', () => {
        const a = makeRow({ teamId: 'a', points: 30, goalDifference: 5 });
        const b = makeRow({ teamId: 'b', points: 30, goalDifference: 10 });
        const criteria = [
            { name: 'Points', logicType: 'points' },
            { name: 'GD', logicType: 'goalDiff' }
        ];
        // Points tied → falls through to goalDiff → b wins
        expect(compareByCriteria(a, b, criteria, [])).toBeGreaterThan(0);
    });

    it('falls back to alphabetical name when all criteria tied', () => {
        const a = makeRow({ teamId: 'a', team: { name: 'Arsenal' }, points: 30 });
        const b = makeRow({ teamId: 'b', team: { name: 'Brighton' }, points: 30 });
        const criteria = [{ name: 'Points', logicType: 'points' }];
        // Both 30 pts → alphabetical: Arsenal < Brighton → negative
        expect(compareByCriteria(a, b, criteria, [])).toBeLessThan(0);
    });

    it('skips unknown logicType with a warning', () => {
        const a = makeRow({ teamId: 'a', points: 10 });
        const b = makeRow({ teamId: 'b', points: 20 });
        const criteria = [
            { name: 'Unknown', logicType: 'xyzzy' },
            { name: 'Points', logicType: 'points' }
        ];
        // Should skip 'xyzzy', then use points → b wins
        expect(compareByCriteria(a, b, criteria, [])).toBeGreaterThan(0);
    });
});
