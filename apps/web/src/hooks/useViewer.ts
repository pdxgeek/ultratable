import { gql, useQuery } from 'urql';

export interface Viewer {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
    roles: string[];
}

const VIEWER_QUERY = gql`
    query Viewer {
        viewer {
            id
            name
            email
            image
            emailVerified
            roles
        }
    }
`;

export function useViewer(): {
    viewer: Viewer | null;
    loading: boolean;
    refetch: () => void;
} {
    const [result, executeQuery] = useQuery<{ viewer: Viewer | null }>({
        query: VIEWER_QUERY,
        requestPolicy: 'cache-and-network',
    });

    return {
        viewer: result.data?.viewer ?? null,
        loading: result.fetching,
        refetch: () => executeQuery({ requestPolicy: 'network-only' }),
    };
}
