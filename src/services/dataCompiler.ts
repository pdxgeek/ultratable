import type {
    ApiFixture,
    Fixture,
    FixtureStatus,
    FormResult,
    MatchEvent,
    StandingsRow,
    SeasonRules,
    Team,
    LeagueRankingFormula,
} from '../types';
import { compareByFormula } from './formulas';

// ─── Status map ────────────────────────────────────────────────────────

function mapStatus(shortStatus: string): FixtureStatus {
    switch (shortStatus) {
        case 'FT':
        case 'AET':
        case 'PEN':
            return 'played';
        case 'NS':
            return 'scheduled';
        case 'TBD':
            return 'unknown';
        case 'PST':
        case 'CANC':
        case 'ABD':
        case 'AWD':
        case 'WO':
            return 'cancelled';
        case '1H':
        case '2H':
        case 'HT':
        case 'ET':
        case 'BT':
        case 'P':
        case 'LIVE':
            return 'live';
        default:
            return 'unknown';
    }
}

// ─── Transformers ──────────────────────────────────────────────────────

// ─── Transformers ──────────────────────────────────────────────────────

export function transformTeams(teams: Team[]): Map<string, Team> {
    const map = new Map<string, Team>();
    for (const t of teams) {
        map.set(t.id, t);
    }
    return map;
}

export function transformFixtures(apiFixtures: ApiFixture[]): Fixture[] {
    // This function might be deprecated if we are using mappers.ts directly in the provider.
    // But usage in App.tsx or useLeagueData might still rely on it if they use raw API data?
    // Current apiFootball.ts returns Fixture[] directly.
    // So this might only be used if we are post-processing?
    // Let's update it just in case, or leave it if it consumes ApiFixture.
    // It consumes ApiFixture and returns Fixture. 
    // We should ensure it returns Fixture with new fields.
    return apiFixtures.map((f) => ({
        id: f.fixture.id.toString(), // Ensure string
        externalReferences: [{ integrationName: 'api-football' as any, remoteId: f.fixture.id.toString() }],
        commonName: `${f.teams.home.name} vs ${f.teams.away.name}`,
        homeTeamId: f.teams.home.id.toString(),
        awayTeamId: f.teams.away.id.toString(),
        homeTeam: { name: f.teams.home.name, logo: f.teams.home.logo, winner: f.teams.home.winner },
        awayTeam: { name: f.teams.away.name, logo: f.teams.away.logo, winner: f.teams.away.winner },
        date: f.fixture.date,
        timestamp: f.fixture.timestamp,
        venue: f.fixture.venue?.name ?? null,
        venueImage: null,
        city: f.fixture.venue?.city ?? null,
        round: f.league.round,
        gameweek: parseInt(f.league.round.replace(/[^0-9]/g, ''), 10) || 0,
        status: mapStatus(f.fixture.status.short),
        statusShort: f.fixture.status.short,
        statusLong: f.fixture.status.long,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        events: undefined,
        eventsLoaded: false,
        lastRefreshed: new Date().toISOString(),
    }));
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
    rankingCriteria: LeagueRankingFormula[] = ['points', 'goalDiff', 'wins']
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

        homeStats.played++;
        awayStats.played++;
        homeStats.goalsFor += f.homeGoals;
        homeStats.goalsAgainst += f.awayGoals;
        awayStats.goalsFor += f.awayGoals;
        awayStats.goalsAgainst += f.homeGoals;

        if (f.homeGoals > f.awayGoals) {
            homeStats.won++;
            awayStats.lost++;
        } else if (f.homeGoals < f.awayGoals) {
            awayStats.won++;
            homeStats.lost++;
        } else {
            homeStats.drawn++;
            awayStats.drawn++;
        }
    }

    // Populate fixture maps for form
    for (const f of sorted) {
        if (f.status === 'cancelled' || f.status === 'postponed') continue;
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
            .sort((a, b) => b.timestamp - a.timestamp);

        const form = played.slice(0, 5).reverse().map((f) => ({
            result: getFormResult(f, teamId)!,
            fixtureId: f.id,
        }));

        const recentFixtures = played.slice(0, 5).reverse();

        const nextFixture =
            all.find(
                (f) =>
                    (f.status === 'scheduled' || f.status === 'postponed') &&
                    f.timestamp * 1000 > now
            ) ?? null;

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
