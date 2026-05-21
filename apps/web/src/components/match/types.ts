export interface MatchPlayer {
    name: string;
    sourceId: number;
    photo: string | null;
}

export interface MatchLineup {
    teamSourceId: number;
    teamName: string;
    teamLogo: string;
    formation: string;
    coachName: string;
    coachPhoto: string;
    startXI: MatchPlayer[];
    substitutes: MatchPlayer[];
}

export interface MatchEvent {
    minute: number;
    extraMinute: number | null;
    teamId: number;
    playerName: string;
    assistName: string | null;
    type: string;
    detail: string;
    comments: string | null;
    subs?: MatchEvent[];
}

export interface MatchTeam {
    id: string;
    name: string;
    shortName: string;
    logo: string;
    sourceId: number;
}

export interface MatchVenue {
    name: string;
    city: string | null;
    image: string | null;
}

export interface MatchFixture {
    id: string;
    season: number;
    leagueSourceId: number;
    scheduledAt: string;
    status: string;
    goalsHome: number | null;
    goalsAway: number | null;
    homeTeam: MatchTeam;
    awayTeam: MatchTeam;
    venue: MatchVenue | null;
    events: MatchEvent[];
    lineups: MatchLineup[];
}

export const MATCH_QUERY = `
  query GetMatch($id: String!) {
    fixture(id: $id) {
      id
      season
      leagueSourceId
      scheduledAt
      status
      goalsHome
      goalsAway
      homeTeam {
        id
        name
        shortName
        logo
        sourceId
      }
      awayTeam {
        id
        name
        shortName
        logo
        sourceId
      }
      venue {
        name
        city
        image
      }
      events {
        minute
        extraMinute
        teamId
        playerName
        assistName
        type
        detail
        comments
      }
      lineups {
        teamSourceId
        teamName
        teamLogo
        formation
        coachName
        coachPhoto
        startXI {
          name
          sourceId
          photo
        }
        substitutes {
          name
          sourceId
          photo
        }
      }
    }
  }
`;
