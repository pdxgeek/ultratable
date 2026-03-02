import { describe, it, expect } from 'vitest';
import { compileStandings } from './dataCompiler';
import type { Team, Fixture } from '../db';

const teams: Team[] = [
    { id: 't1', name: 'Arsenal', updatedAt: '' },
    { id: 't2', name: 'Chelsea', updatedAt: '' },
    { id: 't3', name: 'Brighton', updatedAt: '' },
];

function makeFixture(overrides: Partial<Fixture> & { id: string }): Fixture {
    return {
        seasonId: 's1',
        homeTeamId: 't1',
        awayTeamId: 't2',
        scheduledAt: '2024-01-01T12:00:00Z',
        status: 'played',
        goalsHome: 0,
        goalsAway: 0,
        updatedAt: '',
        ...overrides
    };
}

describe('compileStandings', () => {
    it('calculates points correctly with default 3/1/0 system', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 2, goalsAway: 1 }),
            makeFixture({ id: 'f2', homeTeamId: 't2', awayTeamId: 't3', goalsHome: 1, goalsAway: 1 }),
        ];
        const standings = compileStandings(teams, fixtures);

        const arsenal = standings.find(s => s.teamId === 't1')!;
        const chelsea = standings.find(s => s.teamId === 't2')!;
        const brighton = standings.find(s => s.teamId === 't3')!;

        expect(arsenal.points).toBe(3);
        expect(arsenal.won).toBe(1);
        expect(chelsea.points).toBe(1);
        expect(chelsea.drawn).toBe(1);
        expect(brighton.points).toBe(1);
    });

    it('applies custom points system', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 0, goalsAway: 0 }),
        ];
        const standings = compileStandings(teams, fixtures, {
            pointsForWin: 2, pointsForDraw: 1, pointsForLoss: 0
        });

        expect(standings.find(s => s.teamId === 't1')!.points).toBe(1);
    });

    it('applies point deductions', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 3, goalsAway: 0 }),
        ];
        const standings = compileStandings(teams, fixtures, {
            deductions: [{ teamId: 't1', points: -6, reason: 'FFP breach' }]
        });

        const arsenal = standings.find(s => s.teamId === 't1')!;
        expect(arsenal.points).toBe(-3); // 3 - 6
    });

    it('does not apply deductions when filter is home or away', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 3, goalsAway: 0 }),
        ];
        const standings = compileStandings(teams, fixtures, {
            deductions: [{ teamId: 't1', points: -6, reason: 'test' }],
            filter: 'home'
        });

        const arsenal = standings.find(s => s.teamId === 't1')!;
        expect(arsenal.points).toBe(3); // No deduction in home-only view
    });

    it('filters by home fixtures only', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 2, goalsAway: 0 }),
            makeFixture({ id: 'f2', homeTeamId: 't2', awayTeamId: 't1', goalsHome: 2, goalsAway: 0 }),
        ];
        const standings = compileStandings(teams, fixtures, { filter: 'home' });

        const arsenal = standings.find(s => s.teamId === 't1')!;
        // Arsenal at home: W (3pts). Arsenal away game should be excluded from home stats.
        expect(arsenal.played).toBe(1);
        expect(arsenal.won).toBe(1);
    });

    it('filters by away fixtures only', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 2, goalsAway: 0 }),
            makeFixture({ id: 'f2', homeTeamId: 't2', awayTeamId: 't1', goalsHome: 0, goalsAway: 3 }),
        ];
        const standings = compileStandings(teams, fixtures, { filter: 'away' });

        const arsenal = standings.find(s => s.teamId === 't1')!;
        // Arsenal away only: W at Chelsea (3pts)
        expect(arsenal.played).toBe(1);
        expect(arsenal.won).toBe(1);
    });

    it('calculates goal difference correctly', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 4, goalsAway: 1 }),
        ];
        const standings = compileStandings(teams, fixtures);

        expect(standings.find(s => s.teamId === 't1')!.goalDifference).toBe(3);
        expect(standings.find(s => s.teamId === 't2')!.goalDifference).toBe(-3);
    });

    it('generates form array (last 5 results)', () => {
        const fixtures: Fixture[] = Array.from({ length: 7 }, (_, i) =>
            makeFixture({
                id: `f${i}`,
                homeTeamId: 't1',
                awayTeamId: 't2',
                goalsHome: i % 2 === 0 ? 2 : 0,
                goalsAway: i % 2 === 0 ? 0 : 2,
                scheduledAt: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`
            })
        );
        const standings = compileStandings(teams, fixtures);
        const arsenal = standings.find(s => s.teamId === 't1')!;

        expect(arsenal.form).toHaveLength(5);
        arsenal.form.forEach(f => {
            expect(['W', 'D', 'L']).toContain(f.result);
        });
    });

    it('assigns position numbers after sorting', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 2, goalsAway: 0 }),
            makeFixture({ id: 'f2', homeTeamId: 't3', awayTeamId: 't2', goalsHome: 1, goalsAway: 0 }),
        ];
        const standings = compileStandings(teams, fixtures);

        expect(standings[0].position).toBe(1);
        expect(standings[1].position).toBe(2);
        expect(standings[2].position).toBe(3);
    });

    it('applies zone descriptions', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 3, goalsAway: 0 }),
            makeFixture({ id: 'f2', homeTeamId: 't3', awayTeamId: 't2', goalsHome: 1, goalsAway: 0 }),
        ];
        const standings = compileStandings(teams, fixtures, {
            zones: {
                promotion: [1],
                playoffs: [2],
                relegation: [3]
            }
        });

        expect(standings[0].description).toBe('promotion');
        expect(standings[1].description).toBe('playoffs');
        expect(standings[2].description).toBe('relegation');
    });

    it('handles draws correctly', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', goalsHome: 1, goalsAway: 1 }),
        ];
        const standings = compileStandings(teams, fixtures);

        expect(standings.find(s => s.teamId === 't1')!.drawn).toBe(1);
        expect(standings.find(s => s.teamId === 't2')!.drawn).toBe(1);
    });

    it('ignores non-played fixtures for stats', () => {
        const fixtures: Fixture[] = [
            makeFixture({ id: 'f1', homeTeamId: 't1', awayTeamId: 't2', status: 'scheduled', goalsHome: 0, goalsAway: 0 }),
        ];
        const standings = compileStandings(teams, fixtures);

        expect(standings.find(s => s.teamId === 't1')!.played).toBe(0);
    });

    it('handles empty fixtures list', () => {
        const standings = compileStandings(teams, []);
        expect(standings).toHaveLength(3);
        standings.forEach(s => {
            expect(s.points).toBe(0);
            expect(s.played).toBe(0);
        });
    });
});
