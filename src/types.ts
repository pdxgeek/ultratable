// ─── API-Football raw response types ───────────────────────────────────

export interface ApiTeam {
  team: {
    id: number;
    name: string;
    code: string | null;
    country: string;
    founded: number | null;
    national: boolean;
    logo: string;
  };
  venue: {
    id: number | null;
    name: string | null;
    address: string | null;
    city: string | null;
    capacity: number | null;
    surface: string | null;
    image: string | null;
  };
}

export interface ApiFixture {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    status: {
      long: string;
      short: string; // 'FT' | 'NS' | 'PST' | 'CANC' | 'TBD' | '1H' | '2H' | 'HT' etc.
      elapsed: number | null;
    };
    venue: {
      id: number | null;
      name: string | null;
      city: string | null;
      image?: string | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
    round: string;
  };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
  lineups?: {
    home: Lineup;
    away: Lineup;
  };
}

export interface ApiEvent {
  time: {
    elapsed: number;
    extra: number | null;
  };
  team: {
    id: number;
    name: string;
    logo: string;
  };
  player: {
    id: number | null;
    name: string | null;
  };
  assist: {
    id: number | null;
    name: string | null;
  };
  type: string; // 'Goal' | 'Card' | 'subst' | 'Var'
  detail: string; // 'Normal Goal' | 'Penalty' | 'Own Goal' | 'Yellow Card' etc.
  comments: string | null;
}

export interface ApiStanding {
  rank: number;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  points: number;
  goalsDiff: number;
  group: string;
  form: string | null; // e.g. "WDLWW"
  status: string;
  description: string | null;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  home: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  away: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
}

// ─── Data Packs ────────────────────────────────────────────────────────

export interface SeasonRules {
  promotionSlots: number; // Top N promote automatically
  playoffStart: number;   // e.g. 3
  playoffEnd: number;     // e.g. 6
  relegationStart: number; // e.g. 22 (for a 24 team league, 22, 23, 24 relegate)
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
}

export interface SeasonDataPack {
  leagueId: number;
  season: number;
  name: string;
  teams: string[]; // List of team IDs participating
  rules: SeasonRules;
}



export type TeamDataPack = Map<string, Team>;

export type GfxDataPack = Map<string, string>; // TeamID -> Logo Blob URL

// ─── App domain types ──────────────────────────────────────────────────

export interface BaseEntity {
  id: string; // Internal NanoID
  integrationId: string; // provider:externalId
  commonName: string; // Unified display name
}

export type GraphicType = 'team_logo' | 'venue_image' | 'player_photo' | 'league_logo';

export interface Graphic extends BaseEntity {
  type: GraphicType;
  associationId: string; // ID of the entity it belongs to (Team ID, Player ID)
  sourceUrl: string; // Original URL
}

export type FixtureStatus =
  | 'scheduled'
  | 'played'
  | 'postponed'
  | 'cancelled'
  | 'live'
  | 'unknown';

export interface Fixture extends BaseEntity {
  homeTeamId: string; // Internal ID
  awayTeamId: string; // Internal ID
  homeTeam: { name: string; logo: string; winner?: boolean | null };
  awayTeam: { name: string; logo: string; winner?: boolean | null };
  date: string;         // ISO string
  timestamp: number;
  venue: string | null;
  venueImage: string | null;
  city: string | null;
  round: string;
  gameweek: number;
  status: FixtureStatus;
  statusShort: string;
  statusLong: string; // Display string e.g. "Match Finished"
  homeGoals: number | null;
  awayGoals: number | null;
  events?: MatchEvent[];
  lineups?: {
    home: Lineup;
    away: Lineup;
  };
  eventsLoaded: boolean;
}

export interface MatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: string; // Internal ID
  playerName: string | null;
  assistName: string | null;
  type: string;
  detail: string;
}

export interface Player extends BaseEntity {
  number: number;
  pos: 'GK' | 'DF' | 'MF' | 'FW';
  grid?: string; // e.g. '3:1'
  photo?: string; // Constructed URL
}

export interface Lineup {
  startXI: Player[];
  substitutes: Player[];
  formation: string; // '4-4-2'
}

export interface MatchLineup {
  team: { id: number; name: string; logo: string; colors?: any };
  coach: { id: number; name: string; photo?: string };
  formation: string;
  startXI: { player: Player }[];
  substitutes: { player: Player }[];
}

export type FormResult = 'W' | 'D' | 'L';

export interface FormEntry {
  result: FormResult;
  fixtureId: string; // Internal ID
}

export interface StandingsRow {
  position: number;
  teamId: string; // Internal ID
  team: { name: string; logo: string }; // Denormalized for display
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: FormEntry[];
  recentFixtures: Fixture[];
  nextFixture: Fixture | null;
  description: string | null; // Keep for fallback, but rules should take precedence
}

// Renaming TeamMetadata to Team and extending BaseEntity
export interface Team extends BaseEntity {
  shortCode: string | null;
  venue: string | null;
  venueImage: string | null;
  city: string | null;
  logo: string;
  founded?: number;
  colors?: string[];
}

// ─── Cache types ───────────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

// ─── App state ─────────────────────────────────────────────────────────

export type IntegrationType = 'api-football' | 'mock-scifi' | 'mock-fantasy';

export interface IntegrationCapabilities {
  // Core
  fixtures: IntegrationType;
  standings: IntegrationType;
  basicTeamInfo: IntegrationType;

  // Granular Team Data
  roster: IntegrationType;
  playerStats: IntegrationType;
  teamStats: IntegrationType;

  // Media
  teamLogos: IntegrationType;
  playerPhotos: IntegrationType;
}

export interface LeagueConfig {
  id: number; // Keeping number for now for compatibility, eventual migration to string
  internalId?: string; // New field
  name: string;
  season: number;
  matchesPerSeason: number;
  rules: SeasonRules;
  integrations: IntegrationCapabilities;
}

export const DEFAULT_LEAGUE: LeagueConfig = {
  id: 9999,
  name: 'Galactic Premier League',
  season: 2024,
  matchesPerSeason: 38,
  rules: {
    promotionSlots: 2,
    playoffStart: 3,
    playoffEnd: 6,
    relegationStart: 18,
    pointsForWin: 3,
    pointsForDraw: 1,
    pointsForLoss: 0,
  },
  integrations: {
    fixtures: 'mock-scifi',
    standings: 'mock-scifi',
    basicTeamInfo: 'mock-scifi',
    roster: 'mock-scifi',
    playerStats: 'mock-scifi',
    teamStats: 'mock-scifi',
    teamLogos: 'mock-scifi',
    playerPhotos: 'mock-scifi',
  }
};
