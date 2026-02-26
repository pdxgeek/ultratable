import { describe, it, expect } from 'vitest';
import { compileStandings } from './dataCompiler';
import type { Team, Fixture } from '../db';

describe('compileStandings', () => {
    const mockTeams: Team[] = [
        { id: 't1', name: 'Team A', updatedAt: '' },
        { id: 't2', name: 'Team B', updatedAt: '' }
    ];

    it('calculates points correctly', () => {
        const mockFixtures: Fixture[] = [
            {
                id: 'f1',
                seasonId: 's1',
                homeTeamId: 't1',
                awayTeamId: 't2',
                scheduledAt: '2024-01-01T12:00:00Z',
                status: 'played',
                goalsHome: 2,
                goalsAway: 1,
                updatedAt: ''
            }
        ];

        const standings = compileStandings(mockTeams, mockFixtures);

        expect(standings[0].teamId).toBe('t1');
        expect(standings[0].points).toBe(3);
        expect(standings[1].teamId).toBe('t2');
        expect(standings[1].points).toBe(0);
    });

    it('applies point deductions', () => {
        const mockFixtures: Fixture[] = [];
        const deductions = [{ teamId: 't1', points: -3, reason: 'test deduction' }];
        const standings = compileStandings(mockTeams, mockFixtures, { deductions });

        expect(standings.find(s => s.teamId === 't1')?.points).toBe(-3);
    });
});
