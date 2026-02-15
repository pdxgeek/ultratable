import { describe, it, expect } from 'vitest';
import { compileStandings } from './dataCompiler';
import type { Fixture, Team, SeasonRules } from '../types';

// Mock helpers
const createTeam = (id: string, name: string): Team => ({
    id,
    integrationId: `mock:${id}`,
    commonName: name,
    logo: '',
    shortCode: name.substring(0, 3).toUpperCase(),
    venue: 'Test Venue',
    city: 'Test City',
    founded: 2000,
});

const createFixture = (
    id: string,
    homeId: string,
    awayId: string,
    status: Fixture['status'] = 'scheduled',
    homeGoals: number | null = null,
    awayGoals: number | null = null,
    round: string = 'Regular Season - 1'
): Fixture => ({
    id,
    integrationId: `mock:${id}`,
    commonName: 'Match',
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeTeam: { name: 'Home', logo: '' },
    awayTeam: { name: 'Away', logo: '' },
    date: new Date().toISOString(),
    timestamp: Date.now(),
    venue: 'Test Venue',
    city: 'Test City',
    round,
    gameweek: 1,
    status,
    statusShort: status === 'played' ? 'FT' : status === 'cancelled' ? 'CANC' : 'NS',
    statusLong: status,
    homeGoals,
    awayGoals,
    eventsLoaded: false
});

describe('Standings Compilation - Cancellations', () => {
    const teams = new Map<string, Team>([
        ['1', createTeam('1', 'Team A')],
        ['2', createTeam('2', 'Team B')],
    ]);

    it('should NOT count cancelled games in standings', () => {
        const fixtures: Fixture[] = [
            // Cancelled game
            createFixture('101', '1', '2', 'cancelled', null, null)
        ];

        const standings = compileStandings(teams, fixtures);
        const teamA = standings.find(s => s.teamId === '1')!;
        const teamB = standings.find(s => s.teamId === '2')!;

        expect(teamA.played).toBe(0);
        expect(teamA.points).toBe(0);
        expect(teamB.played).toBe(0);
    });

    it('should NOT count postponed games', () => {
        const fixtures: Fixture[] = [
            createFixture('102', '1', '2', 'postponed', null, null)
        ];

        const standings = compileStandings(teams, fixtures);
        const teamA = standings.find(s => s.teamId === '1')!;

        expect(teamA.played).toBe(0);
    });

    it('should count makeup games when played', () => {
        const fixtures: Fixture[] = [
            // Original postponed
            createFixture('103', '1', '2', 'postponed', null, null),
            // Makeup played
            createFixture('104', '1', '2', 'played', 2, 1)
        ];

        const standings = compileStandings(teams, fixtures);
        const teamA = standings.find(s => s.teamId === '1')!;
        const teamB = standings.find(s => s.teamId === '2')!;

        expect(teamA.played).toBe(1);
        expect(teamA.won).toBe(1);
        expect(teamA.points).toBe(3);

        expect(teamB.played).toBe(1);
        expect(teamB.lost).toBe(1);
        expect(teamB.points).toBe(0);
    });

    it('should ignore played games with null scores (integrity check)', () => {
        const fixtures: Fixture[] = [
            // Played but invalid data
            createFixture('105', '1', '2', 'played', null, null)
        ];

        const standings = compileStandings(teams, fixtures);
        const teamA = standings.find(s => s.teamId === '1')!;
        expect(teamA.played).toBe(0);
    });
});
