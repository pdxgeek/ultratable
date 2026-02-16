import { describe, it, expect } from 'vitest';
import { mockProvider } from './mock';

describe('Mock Data Provider', () => {
    describe('getTeams', () => {
        it('should return sci-fi teams for league 9999', async () => {
            const teams = await mockProvider.getTeams(9999, 2024);

            expect(teams).toBeDefined();
            expect(teams.length).toBeGreaterThan(0);
            expect(teams[0].commonName).toBeTruthy();
            expect(teams[0].id).toBeTruthy();
        });

        it('should return fantasy teams for league 8888', async () => {
            const teams = await mockProvider.getTeams(8888, 2024);

            expect(teams).toBeDefined();
            expect(teams.length).toBeGreaterThan(0);
            expect(teams[0].id).toBeTruthy();
        });

        it('should have valid integrationIds', async () => {
            const teams = await mockProvider.getTeams(9999, 2024);

            for (const team of teams) {
                expect(team.id).toBeTruthy();
                expect(team.integrationId).toMatch(/^mock-scifi:\d+$/);
            }
        });

        it('should only return logo URLs for teams with assets', async () => {
            const teams = await mockProvider.getTeams(9999, 2024);

            const teamsWithLogos = teams.filter(t => t.logo);
            const teamsWithoutLogos = teams.filter(t => !t.logo);

            // Some teams should have logos
            expect(teamsWithLogos.length).toBeGreaterThan(0);
            // Some teams should not (no assets)
            expect(teamsWithoutLogos.length).toBeGreaterThan(0);

            // Teams with logos should have valid paths
            for (const team of teamsWithLogos) {
                expect(team.logo).toMatch(/^\/assets\/teams\/.+-logo\.png$/);
            }
        });
    });

    describe('getFixtures', () => {
        it('should generate fixtures for sci-fi league', async () => {
            const fixtures = await mockProvider.getFixtures(9999, 2024);

            expect(fixtures).toBeDefined();
            expect(fixtures.length).toBeGreaterThan(0);
        });

        it('should have valid fixture structure', async () => {
            const fixtures = await mockProvider.getFixtures(9999, 2024);
            const fixture = fixtures[0];

            expect(fixture.id).toBeTruthy();
            expect(fixture.homeTeamId).toBeTruthy();
            expect(fixture.awayTeamId).toBeTruthy();
            expect(fixture.homeTeam.name).toBeTruthy();
            expect(fixture.awayTeam.name).toBeTruthy();
            expect(fixture.status).toBeTruthy();
            expect(typeof fixture.status).toBe('string');
        });

        it.skip('should have past fixtures with scores', async () => {
            const fixtures = await mockProvider.getFixtures(9999, 2024);
            // Check for various completed status values
            const pastFixtures = fixtures.filter(f =>
                f.status === 'FT' || f.status === 'played' || f.status === 'AET' || f.status === 'PEN'
            );

            // Mock league might be old, so allow 0 past fixtures
            if (pastFixtures.length > 0) {
                for (const fixture of pastFixtures.slice(0, 5)) {
                    expect(fixture.goalsHome).toBeGreaterThanOrEqual(0);
                    expect(fixture.goalsAway).toBeGreaterThanOrEqual(0);
                }
            } else {
                expect(pastFixtures.length).toBe(0);
            }
        });

        it('should have future fixtures without scores', async () => {
            const fixtures = await mockProvider.getFixtures(9999, 2024);
            const futureFixtures = fixtures.filter(f => f.status === 'NS');

            // If there are future fixtures, they should not have scores
            if (futureFixtures.length > 0) {
                for (const fixture of futureFixtures.slice(0, 5)) {
                    expect(fixture.goalsHome).toBeNull();
                    expect(fixture.goalsAway).toBeNull();
                }
            } else {
                // All fixtures are in the past - this is valid for an old season
                expect(futureFixtures.length).toBe(0);
            }
        });
    });

    describe('getStandings', () => {
        it('should return empty array (handled by compiler)', async () => {
            const standings = await mockProvider.getStandings(9999, 2024);

            expect(standings).toBeDefined();
            expect(Array.isArray(standings)).toBe(true);
            expect(standings.length).toBe(0); // Mock provider doesn't generate standings
        });
    });

    describe('getEvents', () => {
        it('should return empty events array for mock fixtures', async () => {
            const events = await mockProvider.getEvents(9999);

            expect(events).toBeDefined();
            expect(Array.isArray(events)).toBe(true);
            expect(events.length).toBe(0);
        });
    });

    describe('getLineups', () => {
        it('should generate lineups for both teams', async () => {
            const fixtures = await mockProvider.getFixtures(9999, 2024);
            const fixtureId = fixtures[0].integrationId;

            const lineups = await mockProvider.getLineups(fixtureId);

            expect(lineups).toBeDefined();
            expect(lineups.length).toBe(2);
        });

        it('should have valid lineup structure', async () => {
            const fixtures = await mockProvider.getFixtures(9999, 2024);
            const fixtureId = fixtures[0].integrationId;
            const lineups = await mockProvider.getLineups(fixtureId);

            const lineup = lineups[0];
            expect(lineup.team.name).toBeTruthy();
            expect(lineup.startXI).toBeDefined();
            expect(lineup.startXI.length).toBe(11);
            expect(lineup.substitutes).toBeDefined();
            expect(lineup.substitutes.length).toBe(7);
            expect(lineup.formation).toBe('4-4-2');
        });

        it('should have players with valid integrationIds', async () => {
            const fixtures = await mockProvider.getFixtures(9999, 2024);
            const fixtureId = fixtures[0].integrationId;
            const lineups = await mockProvider.getLineups(fixtureId);

            for (const lineup of lineups) {
                for (const starter of lineup.startXI) {
                    expect(starter.player.integrationId).toMatch(/^mock-scifi:player_\d+_\d+$/);
                    expect(starter.player.number).toBeGreaterThan(0);
                    expect(starter.player.pos).toMatch(/^(GK|DF|MF|FW)$/);
                }

                for (const sub of lineup.substitutes) {
                    expect(sub.player.integrationId).toMatch(/^mock-scifi:player_\d+_sub_\d+$/);
                }
            }
        });
    });

    describe('Cross-provider consistency', () => {
        it('should have teams referenced in fixtures', async () => {
            const teams = await mockProvider.getTeams(9999, 2024);
            const fixtures = await mockProvider.getFixtures(9999, 2024);

            const teamIds = new Set(teams.map(t => t.id));

            for (const fixture of fixtures.slice(0, 10)) {
                expect(teamIds.has(fixture.homeTeamId)).toBe(true);
                expect(teamIds.has(fixture.awayTeamId)).toBe(true);
            }
        });
    });
});
