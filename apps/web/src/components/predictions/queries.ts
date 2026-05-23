import { gql } from 'urql';

export type PredictionType = 'PROJECTED_FINISH';

export interface PredictionSnapshotEntry {
    teamId: string;
    position: number;
}

export interface PredictionSnapshot {
    id: string;
    userId: string;
    seasonId: string;
    type: PredictionType;
    lockedAt: string;
    deletedAt: string | null;
    entries: PredictionSnapshotEntry[];
}

export const MY_PREDICTIONS_QUERY = gql`
    query MyPredictions($seasonId: ID!, $type: PredictionType!) {
        myPredictions(seasonId: $seasonId, type: $type) {
            id
            userId
            seasonId
            type
            lockedAt
            deletedAt
        }
    }
`;

export const PREDICTION_SNAPSHOT_QUERY = gql`
    query PredictionSnapshot($id: ID!) {
        predictionSnapshot(id: $id) {
            id
            userId
            seasonId
            type
            lockedAt
            deletedAt
            entries {
                teamId
                position
            }
        }
    }
`;

export const LOCK_IN_PREDICTION_MUTATION = gql`
    mutation LockInPrediction($input: LockInPredictionInput!) {
        lockInPrediction(input: $input) {
            id
            userId
            seasonId
            type
            lockedAt
            deletedAt
        }
    }
`;

export const DELETE_PREDICTION_SNAPSHOT_MUTATION = gql`
    mutation DeletePredictionSnapshot($id: ID!) {
        deletePredictionSnapshot(id: $id)
    }
`;
