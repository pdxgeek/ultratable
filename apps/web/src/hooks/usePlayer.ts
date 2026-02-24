import { useQuery } from 'urql';
import { gql } from 'urql';

const PLAYER_QUERY = gql`
  query GetPlayer($sourceId: Int!, $season: Int!) {
    player(sourceId: $sourceId, season: $season) {
      sourceId
      name
      firstname
      lastname
      age
      nationality
      height
      weight
      injured
      photo
      statistics
    }
  }
`;

export function usePlayer(sourceId: number, season: number) {
    const [result] = useQuery({
        query: PLAYER_QUERY,
        variables: { sourceId, season },
        pause: !sourceId || !season,
    });

    return {
        player: result.data?.player,
        isLoading: result.fetching,
        error: result.error,
    };
}
