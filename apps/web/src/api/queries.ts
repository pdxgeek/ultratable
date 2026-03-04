import { gql } from 'urql';

export const SYNC_DATA_QUERY = gql`
  query SyncData($seasonId: String!, $since: DateTime) {
    teams(seasonId: $seasonId, since: $since) {
      id
      name
      shortName
      tla
      logo
      updatedAt
    }
    fixtures(seasonId: $seasonId, since: $since) {
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
    venues(seasonId: $seasonId, since: $since) {
      id
      name
      city
      image
      updatedAt
    }
  }
`;

export const LEAGUE_SEASON_QUERY = gql`
  query GetLeagueSeason($leagueId: String, $season: Int) {
    seasons(leagueId: $leagueId) {
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

