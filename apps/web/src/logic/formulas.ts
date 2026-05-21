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
    deductions?: Array<{ points: number; reason: string }>;
}

export type ComparisonFn = (a: StandingsRow, b: StandingsRow, fixtures: Fixture[]) => number;

/** Aggregates one team's stats across an arbitrary set of fixtures (used by headToHead and awayGoalsFor). */
function aggregateForTeam(
    teamId: string,
    fixtures: Fixture[],
): { points: number; goalsFor: number; goalsAgainst: number } {
    let points = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const f of fixtures) {
        if (f.status !== 'played' || f.goalsHome == null || f.goalsAway == null) continue;
        const isHome = f.homeTeamId === teamId;
        const isAway = f.awayTeamId === teamId;
        if (!isHome && !isAway) continue;

        const gf = isHome ? f.goalsHome : f.goalsAway;
        const ga = isHome ? f.goalsAway : f.goalsHome;
        goalsFor += gf;
        goalsAgainst += ga;
        if (gf > ga) points += 3;
        else if (gf === ga) points += 1;
    }

    return { points, goalsFor, goalsAgainst };
}

export const FORMULA_REGISTRY: Record<string, ComparisonFn> = {
    standard: (a, b) => b.points - a.points,
    points: (a, b) => b.points - a.points,
    goalDiff: (a, b) => b.goalDifference - a.goalDifference,
    wins: (a, b) => b.won - a.won,
    goalsFor: (a, b) => b.goalsFor - a.goalsFor,
    awayGoalsFor: (a, b, fixtures) => {
        const awayA = fixtures.filter((f) => f.awayTeamId === a.teamId && f.status === 'played');
        const awayB = fixtures.filter((f) => f.awayTeamId === b.teamId && f.status === 'played');
        const ga = awayA.reduce((acc, f) => acc + (f.goalsAway ?? 0), 0);
        const gb = awayB.reduce((acc, f) => acc + (f.goalsAway ?? 0), 0);
        return gb - ga;
    },
    // Head-to-head per EFL: within matches between the tied clubs, compare
    // (1) points gained, (2) goal difference, (3) goals scored.
    headToHead: (a, b, fixtures) => {
        const h2h = fixtures.filter(
            (f) =>
                f.status === 'played' &&
                ((f.homeTeamId === a.teamId && f.awayTeamId === b.teamId) ||
                    (f.homeTeamId === b.teamId && f.awayTeamId === a.teamId)),
        );
        if (h2h.length === 0) return 0;

        const statsA = aggregateForTeam(a.teamId, h2h);
        const statsB = aggregateForTeam(b.teamId, h2h);

        if (statsB.points !== statsA.points) return statsB.points - statsA.points;
        const gdA = statsA.goalsFor - statsA.goalsAgainst;
        const gdB = statsB.goalsFor - statsB.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        return statsB.goalsFor - statsA.goalsFor;
    },
};

export function compareByCriteria(
    a: StandingsRow,
    b: StandingsRow,
    criteria: Array<{ name: string; logicType: string }>,
    fixtures: Fixture[],
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
