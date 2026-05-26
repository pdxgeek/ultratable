/**
 * GraphQL operations for the Gameweek-predictions feature (#144).
 *
 * Mirrors the backend surface in apps/service/src/schema/gameweek-predictions.ts.
 * Type shapes here are narrow projections of the server objects — only the
 * fields the editor + history panel actually consume.
 */
import { gql } from 'urql';

export interface GameweekPredictionPick {
    id: string;
    fixtureId: string;
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    manuallyAdded: boolean;
    createdAt: string;
}

export interface GameweekPrediction {
    id: string;
    userId: string;
    seasonId: string;
    gameweek: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    picks: GameweekPredictionPick[];
    pickHistory: GameweekPredictionPick[];
}

/**
 * Lightweight fixture shape used by the editor — only what's needed to render
 * a row (logos come via the team loader; we resolve those client-side from the
 * existing teams Dexie cache, not the GraphQL response, to keep payload small).
 */
export interface GameweekFixture {
    id: string;
    seasonId: string;
    homeTeamId: string;
    awayTeamId: string;
    scheduledAt: string;
    status: 'scheduled' | 'live' | 'played' | 'cancelled' | 'postponed';
    gameweek: number | null;
}

export interface GameweekFixturesPayload {
    gameweek: number;
    fixtures: GameweekFixture[];
    recommended: GameweekFixture[];
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

const FIXTURE_FIELDS = `
    id
    seasonId
    homeTeamId
    awayTeamId
    scheduledAt
    status
    gameweek
`;

const PICK_FIELDS = `
    id
    fixtureId
    homeGoals
    awayGoals
    note
    manuallyAdded
    createdAt
`;

const PREDICTION_FIELDS = `
    id
    userId
    seasonId
    gameweek
    createdAt
    updatedAt
    deletedAt
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const MY_GAMEWEEK_PREDICTIONS_QUERY = gql`
    query MyGameweekPredictions($seasonId: ID!) {
        myGameweekPredictions(seasonId: $seasonId) {
            ${PREDICTION_FIELDS}
        }
    }
`;

/**
 * `gameweekPredictionForWeek` + the editor needs `picks` AND `pickHistory`
 * inline — fetch them in the same round-trip so the editor + history popover
 * hydrate together.
 */
export const GAMEWEEK_PREDICTION_FOR_WEEK_QUERY = gql`
    query GameweekPredictionForWeek($seasonId: ID!, $gameweek: Int!) {
        gameweekPredictionForWeek(seasonId: $seasonId, gameweek: $gameweek) {
            ${PREDICTION_FIELDS}
            picks { ${PICK_FIELDS} }
            pickHistory { ${PICK_FIELDS} }
        }
    }
`;

export const ACTIVE_GAMEWEEK_QUERY = gql`
    query ActiveGameweek($seasonId: ID!) {
        activeGameweek(seasonId: $seasonId)
    }
`;

export const SELECTABLE_GAMEWEEKS_QUERY = gql`
    query SelectableGameweeks($seasonId: ID!) {
        selectableGameweeks(seasonId: $seasonId)
    }
`;

export const GAMEWEEK_FIXTURES_FOR_PREDICTIONS_QUERY = gql`
    query GameweekFixturesForPredictions($seasonId: ID!, $gameweek: Int!) {
        gameweekFixturesForPredictions(seasonId: $seasonId, gameweek: $gameweek) {
            gameweek
            fixtures { ${FIXTURE_FIELDS} }
            recommended { ${FIXTURE_FIELDS} }
        }
    }
`;

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface SubmitGameweekPickInput {
    seasonId: string;
    gameweek: number;
    fixtureId: string;
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    manuallyAdded: boolean;
}

export const SUBMIT_GAMEWEEK_PICK_MUTATION = gql`
    mutation SubmitGameweekPick($input: SubmitGameweekPickInput!) {
        submitGameweekPick(input: $input) {
            ${PICK_FIELDS}
        }
    }
`;

export const DELETE_GAMEWEEK_PREDICTION_MUTATION = gql`
    mutation DeleteGameweekPrediction($id: ID!) {
        deleteGameweekPrediction(id: $id)
    }
`;
