import type {
    Fixture,
    FormResult,
    MatchEvent,
    StandingsRow,
    SeasonRules,
    Team,
    LeagueRankingFormula,
} from '../types';
import { compareByFormula } from './formulas';

export type StandingsFilter = 'all' | 'home' | 'away';

// ─── Transformers ──────────────────────────────────────────────────────

// ─── Transformers ──────────────────────────────────────────────────────

export function transformTeams(teams: Team[]): Map<string, Team> {
    const map = new Map<string, Team>();
    for (const t of teams) {
        map.set(t.id, t);
    }
    return map;
}



export function transformEvents(
    apiEvents: Array<{
        time: { elapsed: number; extra: number | null };
        team: { id: number };
        player: { name: string | null };
        assist: { name: string | null };
        type: string;
        detail: string;
    }>
): MatchEvent[] {
    return apiEvents.map((e) => ({
        minute: e.time.elapsed,
        extraMinute: e.time.extra,
        teamId: e.team.id.toString(),
        playerName: e.player?.name ?? null,
        assistName: e.assist?.name ?? null,
        type: e.type,
        detail: e.detail,
    }));
}

// ─── Compiler ──────────────────────────────────────────────────────────

interface TeamStats {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
}

function getFormResult(
    fixture: Fixture,
    teamId: string
): FormResult | null {
    if (fixture.status !== 'played') return null;
    if (fixture.homeGoals === null || fixture.awayGoals === null) return null;

    const isHome = fixture.homeTeamId === teamId;
    const teamGoals = isHome ? fixture.homeGoals : fixture.awayGoals;
    const oppGoals = isHome ? fixture.awayGoals : fixture.homeGoals;

    if (teamGoals > oppGoals) return 'W';
    if (teamGoals < oppGoals) return 'L';
    return 'D';
}

export function compileStandings(
    teams: Map<string, Team>,
    fixtures: Fixture[],
    _rules?: SeasonRules,
    rankingCriteria: LeagueRankingFormula[] = ['points', 'goalDiff', 'wins'],
    filter: StandingsFilter = 'all'
): StandingsRow[] {
    const stats = new Map<string, TeamStats>();
    const teamFixtures = new Map<string, Fixture[]>();

    // Initialize
    for (const [id] of teams) {
        stats.set(id, {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
        });
        teamFixtures.set(id, []);
    }

    // Sort fixtures
    const sorted = [...fixtures].sort((a, b) => a.timestamp - b.timestamp);

    // Accumulate
    for (const f of sorted) {
        if (f.status !== 'played') continue;
        if (f.homeGoals === null || f.awayGoals === null) continue;

        const homeStats = stats.get(f.homeTeamId);
        const awayStats = stats.get(f.awayTeamId);
        if (!homeStats || !awayStats) continue;

        if (filter !== 'away') {
            homeStats.played++;
            homeStats.goalsFor += f.homeGoals;
            homeStats.goalsAgainst += f.awayGoals;
        }
        if (filter !== 'home') {
            awayStats.played++;
            awayStats.goalsFor += f.awayGoals;
            awayStats.goalsAgainst += f.homeGoals;
        }

        if (f.homeGoals > f.awayGoals) {
            if (filter !== 'away') homeStats.won++;
            if (filter !== 'home') awayStats.lost++;
        } else if (f.homeGoals < f.awayGoals) {
            if (filter !== 'home') awayStats.won++;
            if (filter !== 'away') homeStats.lost++;
        } else {
            if (filter !== 'away') homeStats.drawn++;
            if (filter !== 'home') awayStats.drawn++;
        }
    }

    // Populate fixture maps
    for (const f of sorted) {
        if (f.status === 'cancelled') continue;
        const h = teamFixtures.get(f.homeTeamId);
        const a = teamFixtures.get(f.awayTeamId);
        if (h) h.push(f);
        if (a) a.push(f);
    }

    const rows: StandingsRow[] = [];
    const now = Date.now();

    for (const [teamId, team] of teams) {
        const s = stats.get(teamId)!;
        const all = teamFixtures.get(teamId) ?? [];

        const played = all
            .filter((f) => f.status === 'played')
            .filter((f) => {
                if (filter === 'home') return f.homeTeamId === teamId;
                if (filter === 'away') return f.awayTeamId === teamId;
                return true;
            })
            .sort((a, b) => b.timestamp - a.timestamp);

        const form = played.slice(0, 5).reverse().map((f) => ({
            result: getFormResult(f, teamId)!,
            fixtureId: f.id,
        }));

        const recentFixtures = played.slice(0, 5).reverse();

        // Find the absolute next unplayed match. 
        // We prioritize fixtures in the future or currently live.
        const nextFixture =
            all.find(f => (f.status === 'scheduled' || f.status === 'live') && (f.timestamp * 1000 > now - (2 * 60 * 60 * 1000))) ||
            all.find(f => f.status === 'postponed') ||
            null;

        const basePoints = s.won * (_rules?.pointsForWin ?? 3) +
            s.drawn * (_rules?.pointsForDraw ?? 1) +
            s.lost * (_rules?.pointsForLoss ?? 0);

        const mods = _rules?.pointModifications?.filter(m => m.teamId === teamId) || [];
        const modifiedPoints = mods.reduce((acc, m) => acc + m.modification, basePoints);

        rows.push({
            position: 0,
            teamId: teamId,
            team: { name: team.commonName, logo: team.logo },
            played: s.played,
            won: s.won,
            drawn: s.drawn,
            lost: s.lost,
            goalsFor: s.goalsFor,
            goalsAgainst: s.goalsAgainst,
            goalDifference: s.goalsFor - s.goalsAgainst,
            points: modifiedPoints,
            form,
            recentFixtures,
            nextFixture,
            description: null,
            lastRefreshed: new Date().toISOString(),
        });
    }

    // Sort using registry formulas
    rows.sort((a, b) => compareByFormula(a, b, rankingCriteria, fixtures));

    rows.forEach((r, i) => (r.position = i + 1));

    return rows;
}

export function getTeamFixtures(
    teamId: string,
    fixtures: Fixture[]
): Fixture[] {
    return fixtures
        .filter(
            (f) =>
                (f.homeTeamId === teamId || f.awayTeamId === teamId)
        )
        .sort((a, b) => a.timestamp - b.timestamp);
}
