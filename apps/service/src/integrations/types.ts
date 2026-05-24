export interface IngestedCountry {
    name: string;
    code: string | null;
    flag: string | null;
}

export interface IngestedVenue {
    name: string;
    city: string | null;
    capacity: number | null;
    surface: string | null;
    image: string | null;
    sourceId: number;
    sourceName: string;
}

export interface IngestedTeam {
    name: string;
    shortName: string | null;
    tla: string | null;
    logo: string | null;
    sourceId: number;
    sourceName: string;
    venueSourceId: number | null;
}

export interface IngestedLeague {
    name: string;
    slug: string;
    country: string | null;
    logo: string | null;
    sourceId: number;
    sourceName: string;
}

export interface IngestedSeason {
    year: number;
    startDate: string | null;
    endDate: string | null;
    sourceId: number; // For API-Football, this is the league ID
    sourceName: string;
}

export interface IngestedFixture {
    sourceId: number;
    sourceName: string;
    scheduledAt: string;
    status: 'scheduled' | 'played' | 'postponed' | 'cancelled' | 'live';
    homeTeamSourceId: number;
    awayTeamSourceId: number;
    venueSourceId: number | null;
    homeGoals: number | null;
    awayGoals: number | null;
    gameweek: number | null;
}

export interface IngestedEvent {
    fixtureId: number;
    teamId: number;
    playerName: string | null;
    playerSourceId: number | null;
    playerId?: string | null; // Internal UUID from players table
    assistName: string | null;
    assistSourceId: number | null;
    type: string;
    detail: string;
    comments: string | null;
    minute: number;
    extraMinute: number | null;
}

export interface IngestedLineup {
    teamSourceId: number;
    teamName: string;
    teamLogo: string | null;
    formation: string | null;
    coachName: string | null;
    coachPhoto: string | null;
    startXI: IngestedPlayer[];
    substitutes: IngestedPlayer[];
}

export interface IngestedPlayer {
    sourceId: number;
    name: string;
    firstname: string;
    lastname: string;
    age: number;
    nationality: string;
    height: string | null;
    weight: string | null;
    injured: boolean;
    photo: string | null;
    statistics?: Record<string, unknown>[];
}

export interface IngestedSquadPlayer {
    sourceId: number;
    name: string;
    age: number | null;
    number: number | null;
    position: string | null;
    photo: string | null;
}

/**
 * One coach row from API-Football's `/coachs?team=<sourceId>` endpoint.
 * Captures the full profile + birth info; the `career` blob preserves
 * the upstream's club history so a future "managers I've ranked"
 * feature doesn't need another fetch.
 *
 * `teamSourceId` is the team the coach is *currently* attached to per
 * the upstream — used to resolve our local `team_id` FK on upsert.
 */
export interface IngestedCoach {
    sourceId: number;
    name: string;
    firstName: string | null;
    lastName: string | null;
    age: number | null;
    birthDate: string | null;
    birthPlace: string | null;
    birthCountry: string | null;
    nationality: string | null;
    height: string | null;
    weight: string | null;
    photo: string | null;
    teamSourceId: number | null;
    career: unknown;
}

// Dual-ID contract (AI_README_FIRST.MD §1): every ID here is an external
// provider ID. `leagueSourceId`, `teamSourceId`, `fixtureId` (the upstream
// numeric ID) — never an internal UUID. Do not reintroduce a bare `leagueId`.
export interface IFootballProvider {
    name: string;
    getCountries(): Promise<IngestedCountry[]>;
    getLeagues(country?: string): Promise<IngestedLeague[]>;
    getSeasons(leagueSourceId: number): Promise<IngestedSeason[]>;
    getTeams(
        leagueSourceId: number,
        season: number,
    ): Promise<{ teams: IngestedTeam[]; venues: IngestedVenue[] }>;
    getFixtures(
        leagueSourceId: number,
        season: number,
    ): Promise<{ fixtures: IngestedFixture[]; venues: IngestedVenue[] }>;
    getFixturesByIds(
        sourceIds: number[],
    ): Promise<{ fixtures: IngestedFixture[]; venues: IngestedVenue[] }>;
    getMatchEvents(fixtureId: number): Promise<IngestedEvent[]>;
    getLineups(fixtureId: number): Promise<IngestedLineup[]>;
    getPlayerData(playerId: number, season: number): Promise<IngestedPlayer | null>;
    getSquad(teamSourceId: number): Promise<IngestedSquadPlayer[]>;
    /**
     * Fetch the current coach(es) attached to a team. Backed by
     * `/coachs?team=<sourceId>`. Returns an array because the upstream
     * occasionally lists more than one current entry (e.g. caretaker +
     * permanent manager) — callers usually want index 0.
     */
    getCoachesByTeam(teamSourceId: number): Promise<IngestedCoach[]>;
}
