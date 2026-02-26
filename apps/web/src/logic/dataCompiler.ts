import type { Team, Fixture } from '../db';
import type { StandingsRow } from './formulas';
import { compareByCriteria } from './formulas';

export type StandingsFilter = 'all' | 'home' | 'away';

export interface StandingsOptions {
    criteria?: Array<{ name: string; logicType: string }>;
    filter?: StandingsFilter;
    pointsForWin?: number;
    pointsForDraw?: number;
    pointsForLoss?: number;
    deductions?: Array<{ teamId: string; points: number; reason: string }>;
    zones?: {
        promotion?: number[];
        playoffs?: number[];
        relegation?: number[];
    };
}

export function compileStandings(
    teams: Team[],
    fixtures: Fixture[],
    options: StandingsOptions = {}
): StandingsRow[] {
    const {
        criteria = [
            { name: 'Points', logicType: 'points' },
            { name: 'Goal Difference', logicType: 'goalDiff' },
            { name: 'Wins', logicType: 'wins' }
        ],
        filter = 'all',
        pointsForWin = 3,
        pointsForDraw = 1,
        pointsForLoss = 0
    } = options;

    const statsMap = new Map<string, {
        played: number; won: number; drawn: number; lost: number;
        goalsFor: number; goalsAgainst: number;
    }>();

    const teamFixturesMap = new Map<string, Fixture[]>();

    teams.forEach(team => {
        statsMap.set(team.id, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
        teamFixturesMap.set(team.id, []);
    });

    // Distribute fixtures to teams
    fixtures.forEach(f => {
        const h = teamFixturesMap.get(f.homeTeamId);
        const a = teamFixturesMap.get(f.awayTeamId);
        if (h) h.push(f);
        if (a) a.push(f);
    });

    // Sort team fixtures by date
    teamFixturesMap.forEach(list => {
        list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    });

    // Process played fixtures for stats
    fixtures.filter(f => f.status === 'played').forEach(f => {
        if (f.goalsHome === undefined || f.goalsAway === undefined) return;

        const homeStats = statsMap.get(f.homeTeamId);
        const awayStats = statsMap.get(f.awayTeamId);
        if (!homeStats || !awayStats) return;

        if (filter !== 'away') {
            homeStats.played++;
            homeStats.goalsFor += f.goalsHome;
            homeStats.goalsAgainst += f.goalsAway;
        }
        if (filter !== 'home') {
            awayStats.played++;
            awayStats.goalsFor += f.goalsAway;
            awayStats.goalsAgainst += f.goalsHome;
        }

        if (f.goalsHome > f.goalsAway) {
            if (filter !== 'away') homeStats.won++;
            if (filter !== 'home') awayStats.lost++;
        } else if (f.goalsHome < f.goalsAway) {
            if (filter !== 'home') awayStats.won++;
            if (filter !== 'away') homeStats.lost++;
        } else {
            if (filter !== 'away') homeStats.drawn++;
            if (filter !== 'home') awayStats.drawn++;
        }
    });

    const rows: StandingsRow[] = teams.map(team => {
        const s = statsMap.get(team.id)!;
        const allFixtures = teamFixturesMap.get(team.id) || [];

        const played = allFixtures
            .filter(f => f.status === 'played')
            .filter(f => {
                if (filter === 'home') return f.homeTeamId === team.id;
                if (filter === 'away') return f.awayTeamId === team.id;
                return true;
            })
            .reverse();

        const form = played.slice(0, 5).reverse().map(f => {
            const isHome = f.homeTeamId === team.id;
            const tG = isHome ? (f.goalsHome || 0) : (f.goalsAway || 0);
            const oG = isHome ? (f.goalsAway || 0) : (f.goalsHome || 0);
            let result: 'W' | 'D' | 'L' = 'D';
            if (tG > oG) result = 'W';
            else if (tG < oG) result = 'L';

            return { result, fixtureId: f.id } as { result: 'W' | 'D' | 'L'; fixtureId: string };
        });

        const nextFixture = allFixtures.find(f =>
            ['scheduled', 'live'].includes(f.status) &&
            new Date(f.scheduledAt).getTime() > new Date().getTime() - (2 * 60 * 60 * 1000)
        ) || null;

        const basePoints = s.won * pointsForWin + s.drawn * pointsForDraw + s.lost * pointsForLoss;
        const teamDeductions = options.deductions?.filter(d => d.teamId === team.id) || [];

        // Only apply deductions when viewing 'all' fixtures
        const deductionPoints = filter === 'all' ? teamDeductions.reduce((acc, d) => acc + d.points, 0) : 0;
        const modifiedPoints = basePoints + deductionPoints;

        return {
            position: 0,
            teamId: team.id,
            team: { name: team.name, logo: team.logo },
            played: s.played,
            won: s.won,
            drawn: s.drawn,
            lost: s.lost,
            goalsFor: s.goalsFor,
            goalsAgainst: s.goalsAgainst,
            goalDifference: s.goalsFor - s.goalsAgainst,
            points: modifiedPoints,
            form,
            recentFixtures: played.slice(0, 5).reverse(),
            nextFixture,
            description: null,
            lastRefreshed: new Date().toISOString(),
            deductions: filter === 'all' ? teamDeductions : []
        };
    });

    rows.sort((a, b) => compareByCriteria(a, b, criteria, fixtures));
    rows.forEach((r, i) => {
        r.position = i + 1;
        if (options.zones?.promotion?.includes(r.position)) r.description = 'promotion';
        else if (options.zones?.playoffs?.includes(r.position)) r.description = 'playoffs';
        else if (options.zones?.relegation?.includes(r.position)) r.description = 'relegation';
    });

    return rows;
}
