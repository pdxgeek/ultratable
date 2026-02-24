import type { Fixture } from '../db';

export interface StandingsRow {
    position: number;
    teamId: string;
    team: { name: string; logo?: string };
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
    form: Array<{ result: 'W' | 'D' | 'L'; fixtureId: string }>;
    recentFixtures: Fixture[];
    nextFixture: Fixture | null;
    description: string | null;
    lastRefreshed: string;
}

export type ComparisonFn = (a: StandingsRow, b: StandingsRow, fixtures: Fixture[]) => number;

export const FORMULA_REGISTRY: Record<string, ComparisonFn> = {
    standard: (a, b) => b.points - a.points,
    points: (a, b) => b.points - a.points,
    goalDiff: (a, b) => b.goalDifference - a.goalDifference,
    wins: (a, b) => b.won - a.won,
    goalsFor: (a, b) => b.goalsFor - a.goalsFor,
    headToHead: (a, b, fixtures) => {
        const h2hMatches = fixtures.filter(f =>
            (f.homeTeamId === a.teamId && f.awayTeamId === b.teamId) ||
            (f.homeTeamId === b.teamId && f.awayTeamId === a.teamId)
        ).filter(f => f.status === 'played');

        if (h2hMatches.length === 0) return 0;

        let aPoints = 0;
        let bPoints = 0;

        for (const f of h2hMatches) {
            if (f.goalsHome === undefined || f.goalsAway === undefined) continue;

            if (f.goalsHome === f.goalsAway) {
                aPoints += 1;
                bPoints += 1;
            } else if (f.homeTeamId === a.teamId) {
                if (f.goalsHome > f.goalsAway) aPoints += 3;
                else bPoints += 3;
            } else {
                if (f.goalsAway > f.goalsHome) aPoints += 3;
                else bPoints += 3;
            }
        }

        return bPoints - aPoints;
    }
};

export function compareByCriteria(
    a: StandingsRow,
    b: StandingsRow,
    criteria: Array<{ name: string; logicType: string }>,
    fixtures: Fixture[]
): number {
    for (const criterion of criteria) {
        const compare = FORMULA_REGISTRY[criterion.logicType];
        if (!compare) {
            console.warn(`Unknown ranking logic type: ${criterion.logicType}`);
            continue;
        }

        const result = compare(a, b, fixtures);
        if (result !== 0) return result;
    }

    return a.team.name.localeCompare(b.team.name);
}
