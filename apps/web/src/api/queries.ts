import { gql } from 'urql';

export const SYNC_DATA_QUERY = gql`
  query SyncData($leagueId: Int!, $season: Int!, $since: DateTime) {
    teams(leagueId: $leagueId, season: $season, since: $since) {
      id
      name
      shortName
      tla
      logo
      updatedAt
    }
    fixtures(leagueId: $leagueId, season: $season, since: $since) {
      id
      seasonId
      homeTeamId
      awayTeamId
      venueId
      scheduledAt
      status
      goalsHome
      goalsAway
      gameweek
      updatedAt
    }
    venues(leagueId: $leagueId, season: $season) {
      id
      name
      city
      image
      updatedAt
    }
  }
`;

export const LEAGUE_SEASON_QUERY = gql`
  query GetLeagueSeason($leagueId: Int!, $season: Int!) {
    seasons(leagueId: $leagueId, year: $season) {
      id
      leagueId
      year
      updatedAt
      rankingCriteria {
        id
        name
        logicType
      }
    }
  }
`;
