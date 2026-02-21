import { describe, it, expect } from 'vitest';
import { compileStandings } from '../../services/dataCompiler';
import bbcData from './championshipBBC.json';
import type { Team, Fixture, SeasonRules } from '../../types';

describe('EFL Championship Validation (vs BBC ground truth)', () => {
    it('should correctly calculate the table including deductions', () => {
        // 1. Create Team entities for all BBC teams
        const teamsMap = new Map<string, Team>();
        bbcData.forEach(row => {
            const id = `team_${row["Team Name"].toLowerCase().replace(/\s+/g, '_')}`;
            const team: Team = {
                id,
                commonName: row["Team Name"],
                logo: '',
                externalReferences: [],
                shortCode: null,
                venue: null,
                venueImage: null,
                city: null,
                lastRefreshed: new Date().toISOString()
            };
            teamsMap.set(id, team);
        });

        // Add dummy opponent so fixtures aren't skipped
        teamsMap.set('team_dummy', {
            id: 'team_dummy',
            commonName: 'Dummy Opponent',
            logo: '',
            externalReferences: [],
            shortCode: 'DUM',
            venue: null,
            venueImage: null,
            city: null,
            lastRefreshed: new Date().toISOString()
        });

        // 2. Synthesize Fixtures to match the stats
        // For each team, create N wins (1-0), D draws (1-1), L losses (0-1)
        // Then adjust goals to match Goals For/Against
        const fixtures: Fixture[] = [];
        let fixtureId = 1;

        teamsMap.forEach((team, teamId) => {
            if (teamId === 'team_dummy') return;
            const stats = bbcData.find(r => r["Team Name"] === team.commonName)!;

            // We use a dummy opponent for non-h2h validation of point logic
            const dummyOpponentId = 'team_dummy';

            // Wins
            for (let i = 0; i < stats.Won; i++) {
                fixtures.push(createFixture(fixtureId++, teamId, dummyOpponentId, 1, 0));
            }
            // Draws
            for (let i = 0; i < stats.Drawn; i++) {
                fixtures.push(createFixture(fixtureId++, teamId, dummyOpponentId, 1, 1));
            }
            // Losses
            for (let i = 0; i < stats.Lost; i++) {
                fixtures.push(createFixture(fixtureId++, teamId, dummyOpponentId, 0, 1));
            }

            // Adjust Goals (this is a simplified model to verify the compiler sums correctly)
            // The compiler sums ALL fixtures, so we just need the totals to match.
            // Note: In a real season, these would be shared matches. 
            // Here we just want to see if SUM(goals) works.
            const currentGF = stats.Won + stats.Drawn;
            const currentGA = stats.Drawn + stats.Lost;
            const extraGF = stats["Goals For"] - currentGF;
            const extraGA = stats["Goals Against"] - currentGA;

            if (extraGF > 0) {
                // Add extra goals to the first win or draw
                const f = fixtures.find(f => f.homeTeamId === teamId);
                if (f) f.homeGoals! += extraGF;
            }
            if (extraGA > 0) {
                const f = fixtures.find(f => f.homeTeamId === teamId);
                if (f) f.awayGoals! += extraGA;
            }
        });

        // 3. Define the rules including point deductions
        const rules: SeasonRules = {
            pointsForWin: 3,
            pointsForDraw: 1,
            pointsForLoss: 0,
            rankingCriteria: ['points', 'goalDiff', 'goalsFor'],
            pointModifications: [
                { teamId: 'team_sheffield_wednesday', modification: -18, note: 'Administration' },
                { teamId: 'team_leicester_city', modification: -6, note: 'EFL Breaches' }
            ],
            promotionSlots: 2,
            playoffStart: 3,
            playoffEnd: 6,
            relegationStart: 22
        };

        // 4. Compile
        const allRows = compileStandings(teamsMap, fixtures, { rules });

        // Filter out dummy opponent for validation
        const result = allRows.filter(r => bbcData.some(b => b["Team Name"] === r.team.name));

        console.log('Comparison:');
        ['Luton Town', 'Queens Park Rangers'].forEach(name => {
            const row = result.find(r => r.team.name === name);
            if (row) {
                console.log(`${name}: Pts=${row.points}, GD=${row.goalDifference}, GF=${row.goalsFor}`);
            }
        });

        // 5. Assertions
        bbcData.forEach((bbcRow, index) => {
            const appRow = result[index];
            expect(appRow.team.name).toBe(bbcRow["Team Name"]);
            expect(appRow.points).toBe(bbcRow.Points);
            expect(appRow.goalDifference).toBe(bbcRow["Goal Difference"]);
            expect(appRow.played).toBe(bbcRow.Played);
        });
    });
});

function createFixture(id: number, homeId: string, awayId: string, hg: number, ag: number): Fixture {
    return {
        id: `fixture_${id}`,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeGoals: hg,
        awayGoals: ag,
        status: 'played',
        timestamp: Math.floor(Date.now() / 1000) - id * 3600,
        gameweek: 1,
        externalReferences: []
    } as any;
}
