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

export interface IFootballProvider {
    name: string;
    getCountries(): Promise<IngestedCountry[]>;
    getLeagues(country?: string): Promise<IngestedLeague[]>;
    getSeasons(leagueId: number): Promise<IngestedSeason[]>;
    getTeams(leagueId: number, season: number): Promise<{ teams: IngestedTeam[], venues: IngestedVenue[] }>;
    getFixtures(leagueId: number, season: number): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }>;
    getFixturesByIds(sourceIds: number[]): Promise<{ fixtures: IngestedFixture[], venues: IngestedVenue[] }>;
    getMatchEvents(fixtureId: number): Promise<IngestedEvent[]>;
    getLineups(fixtureId: number): Promise<IngestedLineup[]>;
    getPlayerData(playerId: number, season: number): Promise<IngestedPlayer | null>;
    getSquad(teamSourceId: number): Promise<IngestedSquadPlayer[]>;
}
