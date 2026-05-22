import { gql, useQuery } from 'urql';

export interface ViewerIdentity {
    authUserId: string;
    provider: string;
    linkedAt: string;
}

export interface ViewerGrant {
    resourceType: string;
    resourceId: string;
    role: string;
}

export interface Viewer {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
    roles: string[];
    createdAt: string;
    identities: ViewerIdentity[];
    followedLeagueIds: string[];
    myGrants: ViewerGrant[];
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
            createdAt
            identities {
                authUserId
                provider
                linkedAt
            }
            followedLeagueIds
            myGrants {
                resourceType
                resourceId
                role
            }
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
