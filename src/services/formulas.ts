import type { StandingsRow, Fixture, LeagueRankingFormula } from '../types';

export type ComparisonFn = (a: StandingsRow, b: StandingsRow, fixtures: Fixture[]) => number;

export const FORMULAS: Record<LeagueRankingFormula, ComparisonFn> = {
    points: (a, b) => b.points - a.points,
    goalDiff: (a, b) => b.goalDifference - a.goalDifference,
    wins: (a, b) => b.won - a.won,
    awayGoalsScored: (a, b) => b.goalsFor - a.goalsFor, // Simple column lookup for demonstration
    headToHead: (a, b, fixtures) => {
        const h2hMatches = fixtures.filter(f =>
            (f.homeTeamId === a.teamId && f.awayTeamId === b.teamId) ||
            (f.homeTeamId === b.teamId && f.awayTeamId === a.teamId)
        ).filter(f => f.status === 'played');

        if (h2hMatches.length === 0) return 0;

        let aPoints = 0;
        let bPoints = 0;

        for (const f of h2hMatches) {
            if (f.homeGoals === null || f.awayGoals === null) continue;

            if (f.homeGoals === f.awayGoals) {
                aPoints += 1;
                bPoints += 1;
            } else if (f.homeTeamId === a.teamId) {
                if (f.homeGoals > f.awayGoals) aPoints += 3;
                else bPoints += 3;
            } else {
                if (f.awayGoals > f.homeGoals) aPoints += 3;
                else bPoints += 3;
            }
        }

        return bPoints - aPoints;
    }
};

export function compareByFormula(
    a: StandingsRow,
    b: StandingsRow,
    criteria: LeagueRankingFormula[],
    fixtures: Fixture[]
): number {
    for (const formulaName of criteria) {
        const compare = FORMULAS[formulaName];
        if (!compare) continue;

        const result = compare(a, b, fixtures);
        if (result !== 0) return result;
    }

    // Default: name comparison
    return a.team.name.localeCompare(b.team.name);
}
