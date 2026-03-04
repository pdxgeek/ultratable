import { gql } from 'urql';

export const SYNC_DATA_QUERY = gql`
  query SyncData($leagueSourceId: Int!, $seasonYear: Int!, $since: DateTime) {
    teams(leagueSourceId: $leagueSourceId, seasonYear: $seasonYear, since: $since) {
      id
      name
      shortName
      tla
      logo
      updatedAt
    }
    fixtures(leagueSourceId: $leagueSourceId, seasonYear: $seasonYear, since: $since) {
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
    venues(leagueSourceId: $leagueSourceId, seasonYear: $seasonYear, since: $since) {
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

