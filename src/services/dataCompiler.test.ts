import { describe, it, expect } from 'vitest';
import { compileStandings, transformTeams } from './dataCompiler';
import type { Team, Fixture, SeasonRules } from '../types';

describe('Data Compiler', () => {
    const rules: SeasonRules = {
        promotionSlots: 2,
        playoffStart: 3,
        playoffEnd: 6,
        relegationStart: 18,
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
    };

    describe('transformTeams', () => {
        it('should convert array to map keyed by id', () => {
            const teams: Team[] = [
                {
                    id: '100',
                    integrationId: 'test:100',
                    commonName: 'Team A',
                    shortCode: 'TEA',
                    venue: 'Stadium A',
                    venueImage: '',
                    city: 'City A',
                    logo: 'logo-a.png',
                    founded: 2000,
                },
                {
                    id: '101',
                    integrationId: 'test:101',
                    commonName: 'Team B',
                    shortCode: 'TEB',
                    venue: 'Stadium B',
                    venueImage: '',
                    city: 'City B',
                    logo: 'logo-b.png',
                    founded: 2001,
                },
            ];

            const teamMap = transformTeams(teams);

            expect(teamMap.size).toBe(2);
            expect(teamMap.get('100')?.commonName).toBe('Team A');
            expect(teamMap.get('101')?.commonName).toBe('Team B');
        });
    });

    describe('compileStandings', () => {
        const teams: Team[] = [
            {
                id: '100',
                integrationId: 'test:100',
                commonName: 'Team A',
                shortCode: 'TEA',
                venue: 'Stadium A',
                venueImage: '',
                city: 'City A',
                logo: 'logo-a.png',
                founded: 2000,
            },
            {
                id: '101',
                integrationId: 'test:101',
                commonName: 'Team B',
                shortCode: 'TEB',
                venue: 'Stadium B',
                venueImage: '',
                city: 'City B',
                logo: 'logo-b.png',
                founded: 2001,
            },
        ];

        const teamMap = transformTeams(teams);

        it('should compile standings from fixtures', () => {
            const fixtures: Fixture[] = [
                {
                    id: '1',
                    integrationId: 'test:1',
                    commonName: 'Match 1',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: true },
                    awayTeam: { name: 'Team B', logo: '', winner: false },
                    date: '2024-01-01',
                    timestamp: Date.now(),
                    status: 'played',
                    venue: 'Stadium A',
                    round: 'Round 1',
                    homeGoals: 2,
                    awayGoals: 1,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
            ];

            const standings = compileStandings(teamMap, fixtures, rules);

            expect(standings.length).toBe(2);

            const teamA = standings.find(s => s.teamId === '100');
            const teamB = standings.find(s => s.teamId === '101');

            expect(teamA?.played).toBe(1);
            expect(teamA?.won).toBe(1);
            expect(teamA?.points).toBe(3);
            expect(teamA?.goalsFor).toBe(2);
            expect(teamA?.goalsAgainst).toBe(1);
            expect(teamA?.goalDifference).toBe(1);

            expect(teamB?.played).toBe(1);
            expect(teamB?.lost).toBe(1);
            expect(teamB?.points).toBe(0);
        });

        it('should handle draws correctly', () => {
            const fixtures: Fixture[] = [
                {
                    id: '1',
                    integrationId: 'test:1',
                    commonName: 'Match 1',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: null },
                    awayTeam: { name: 'Team B', logo: '', winner: null },
                    date: '2024-01-01',
                    timestamp: Date.now(),
                    status: 'played',
                    venue: 'Stadium A',
                    round: 'Round 1',
                    homeGoals: 1,
                    awayGoals: 1,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
            ];

            const standings = compileStandings(teamMap, fixtures, rules);

            const teamA = standings.find(s => s.teamId === '100');
            const teamB = standings.find(s => s.teamId === '101');

            expect(teamA?.drawn).toBe(1);
            expect(teamA?.points).toBe(1);
            expect(teamB?.drawn).toBe(1);
            expect(teamB?.points).toBe(1);
        });

        it('should sort teams by points, then goal difference, then goals scored', () => {
            const fixtures: Fixture[] = [
                // Team A: 3 points, GD +2, GF 3
                {
                    id: '1',
                    integrationId: 'test:1',
                    commonName: 'Match 1',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: true },
                    awayTeam: { name: 'Team B', logo: '', winner: false },
                    date: '2024-01-01',
                    timestamp: Date.now(),
                    status: 'played',
                    venue: 'Stadium A',
                    round: 'Round 1',
                    homeGoals: 3,
                    awayGoals: 1,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
            ];

            const standings = compileStandings(teamMap, fixtures, rules);

            expect(standings[0].teamId).toBe('100'); // Team A wins
            expect(standings[0].position).toBe(1);
            expect(standings[1].position).toBe(2);
        });

        it('should only include finished matches', () => {
            const fixtures: Fixture[] = [
                {
                    id: '1',
                    integrationId: 'test:1',
                    commonName: 'Finished Match',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: true },
                    awayTeam: { name: 'Team B', logo: '', winner: false },
                    date: '2024-01-01',
                    timestamp: Date.now(),
                    status: 'played',
                    venue: 'Stadium A',
                    round: 'Round 1',
                    homeGoals: 2,
                    awayGoals: 1,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
                {
                    id: '2',
                    integrationId: 'test:2',
                    commonName: 'Upcoming Match',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: null },
                    awayTeam: { name: 'Team B', logo: '', winner: null },
                    date: '2024-02-01',
                    timestamp: Date.now(),
                    status: 'NS',
                    venue: 'Stadium A',
                    round: 'Round 2',
                    homeGoals: null,
                    awayGoals: null,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
            ];

            const standings = compileStandings(teamMap, fixtures, rules);

            const teamA = standings.find(s => s.teamId === '100');
            expect(teamA?.played).toBe(1); // Only finished match counts
        });

        it('should calculate form correctly', () => {
            const fixtures: Fixture[] = [
                // Win
                {
                    id: '1',
                    integrationId: 'test:1',
                    commonName: 'Match 1',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: true },
                    awayTeam: { name: 'Team B', logo: '', winner: false },
                    date: '2024-01-01',
                    timestamp: Date.now() - 5000,
                    status: 'played',
                    venue: 'Stadium A',
                    round: 'Round 1',
                    homeGoals: 2,
                    awayGoals: 0,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
                // Draw
                {
                    id: '2',
                    integrationId: 'test:2',
                    commonName: 'Match 2',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: null },
                    awayTeam: { name: 'Team B', logo: '', winner: null },
                    date: '2024-01-08',
                    timestamp: Date.now() - 4000,
                    status: 'played',
                    venue: 'Stadium A',
                    round: 'Round 2',
                    homeGoals: 1,
                    awayGoals: 1,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
                // Loss
                {
                    id: '3',
                    integrationId: 'test:3',
                    commonName: 'Match 3',
                    homeTeamId: '101',
                    awayTeamId: '100',
                    homeTeam: { name: 'Team B', logo: '', winner: true },
                    awayTeam: { name: 'Team A', logo: '', winner: false },
                    date: '2024-01-15',
                    timestamp: Date.now() - 3000,
                    status: 'played',
                    venue: 'Stadium B',
                    round: 'Round 3',
                    homeGoals: 3,
                    awayGoals: 0,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
            ];

            const standings = compileStandings(teamMap, fixtures, rules);
            const teamA = standings.find(s => s.teamId === '100');

            expect(teamA?.form.length).toBe(3);
            expect(teamA?.form[0].result).toBe('W'); // Oldest first
            expect(teamA?.form[1].result).toBe('D');
            expect(teamA?.form[2].result).toBe('L'); // Most recent last
        });
    });
});
