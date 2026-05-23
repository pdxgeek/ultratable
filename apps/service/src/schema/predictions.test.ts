/**
 * Predictions resolver tests (issue #105).
 *
 * Covers the auth matrix (owner / non-owner / admin / guest), payload
 * validation, the per-scope cap (including soft-deleted rows counting), and
 * idempotent soft-delete. The repository is the type-checked mock, so this
 * file pins the resolver contract without touching Postgres — the real DB
 * round-trip is exercised in `repositories/predictions.repository.integration.test.ts`.
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { abilityFor } from '../auth/abilities';
import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { builder } from './builder';

import './viewer';
import './predictions';

vi.mock('../db', () => ({
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

type Ctx = {
    user?: { id: string; roles: string[] };
    loaders: ReturnType<typeof createLoaders>;
    ability: Awaited<ReturnType<typeof abilityFor>>;
};
type YogaInstance = ReturnType<typeof createYoga<Ctx>>;

function createTestYoga(user?: Ctx['user']): YogaInstance {
    return createYoga({
        schema: builder.toSchema(),
        maskedErrors: false,
        context: async () => ({
            user,
            loaders: createLoaders(),
            ability: await abilityFor(user),
        }),
    });
}

async function gql(
    yoga: YogaInstance,
    query: string,
    variables?: Record<string, unknown>,
): Promise<{
    data?: Record<string, unknown>;
    errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}> {
    const res = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    return res.json() as Promise<{
        data?: Record<string, unknown>;
        errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
    }>;
}

const PREDICTIONS_USER = { id: 'user-owner', roles: ['user', 'predictions'] };
const PREDICTIONS_OTHER = { id: 'user-other', roles: ['user', 'predictions'] };
const PLAIN_USER = { id: 'user-plain', roles: ['user'] };
const ADMIN_USER = { id: 'admin-1', roles: ['admin'] };

const SEASON_ID = '00000000-0000-0000-0000-000000000001';
const TEAM_A = '00000000-0000-0000-0000-0000000000aa';
const TEAM_B = '00000000-0000-0000-0000-0000000000bb';
const TEAM_C = '00000000-0000-0000-0000-0000000000cc';

function seasonTeams() {
    return [TEAM_A, TEAM_B, TEAM_C].map((id) => ({
        id,
        name: id,
        shortName: null,
        tla: null,
        logo: null,
        venueId: null,
        sourceName: 'test',
        sourceId: 0,
        metadata: null,
        rawResponse: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }));
}

function snapshot(overrides: Partial<{ id: string; userId: string }> = {}) {
    return {
        id: overrides.id ?? 'snap-1',
        userId: overrides.userId ?? PREDICTIONS_USER.id,
        seasonId: SEASON_ID,
        type: 'projected_finish' as const,
        lockedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Mutation.lockInPrediction
// ---------------------------------------------------------------------------
describe('Mutation.lockInPrediction', () => {
    const QUERY = `
        mutation($input: LockInPredictionInput!) {
            lockInPrediction(input: $input) {
                id userId seasonId type
                entries { teamId position }
            }
        }
    `;

    function input(orderedTeamIds: string[] = [TEAM_A, TEAM_B, TEAM_C]) {
        return { input: { seasonId: SEASON_ID, type: 'PROJECTED_FINISH', orderedTeamIds } };
    }

    it('rejects guests with Unauthenticated', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
        expect(repository.predictions.createSnapshot).not.toHaveBeenCalled();
    });

    it('rejects users without the predictions role with Forbidden', async () => {
        const yoga = createTestYoga(PLAIN_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
        expect(repository.predictions.createSnapshot).not.toHaveBeenCalled();
    });

    it('rejects payload size mismatch with INVALID_PREDICTION_PAYLOAD', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(seasonTeams());
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input([TEAM_A, TEAM_B]));
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_PREDICTION_PAYLOAD');
        expect(repository.predictions.createSnapshot).not.toHaveBeenCalled();
    });

    it('rejects unknown team ids', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(seasonTeams());
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input([TEAM_A, TEAM_B, 'team-z']));
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_PREDICTION_PAYLOAD');
    });

    it('rejects duplicate team ids', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(seasonTeams());
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input([TEAM_A, TEAM_A, TEAM_C]));
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_PREDICTION_PAYLOAD');
    });

    it('rejects when the season has no teams imported yet', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue([]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_PREDICTION_PAYLOAD');
    });

    it('enforces the floor cap at 50 even when gameweekCount is small', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(seasonTeams());
        vi.mocked(repository.predictions.countSnapshotsInScope).mockResolvedValue(50);
        vi.mocked(repository.predictions.countGameweeksInSeason).mockResolvedValue(10);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors?.[0].extensions?.code).toBe('PREDICTION_LIMIT_REACHED');
        expect(result.errors?.[0].extensions?.count).toBe(50);
        expect(result.errors?.[0].extensions?.limit).toBe(50);
        expect(repository.predictions.createSnapshot).not.toHaveBeenCalled();
    });

    it('raises the cap to gameweekCount when it exceeds the floor', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(seasonTeams());
        vi.mocked(repository.predictions.countSnapshotsInScope).mockResolvedValue(60);
        vi.mocked(repository.predictions.countGameweeksInSeason).mockResolvedValue(70);
        vi.mocked(repository.predictions.createSnapshot).mockResolvedValue(snapshot());
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors).toBeUndefined();
        expect(repository.predictions.createSnapshot).toHaveBeenCalled();
    });

    it('passes the viewer id from ctx (clients cannot target another user)', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(seasonTeams());
        vi.mocked(repository.predictions.createSnapshot).mockResolvedValue(snapshot());
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors).toBeUndefined();
        expect(repository.predictions.createSnapshot).toHaveBeenCalledWith({
            userId: PREDICTIONS_USER.id,
            seasonId: SEASON_ID,
            type: 'projected_finish',
            entries: [
                { teamId: TEAM_A, position: 1 },
                { teamId: TEAM_B, position: 2 },
                { teamId: TEAM_C, position: 3 },
            ],
        });
    });

    it('lets admins create predictions even without the predictions role', async () => {
        vi.mocked(repository.teams.getTeamsBySeasonId).mockResolvedValue(seasonTeams());
        vi.mocked(repository.predictions.createSnapshot).mockResolvedValue(
            snapshot({ userId: ADMIN_USER.id }),
        );
        const yoga = createTestYoga(ADMIN_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors).toBeUndefined();
        expect(repository.predictions.createSnapshot).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Mutation.deletePredictionSnapshot
// ---------------------------------------------------------------------------
describe('Mutation.deletePredictionSnapshot', () => {
    const QUERY = `mutation($id: ID!) { deletePredictionSnapshot(id: $id) }`;

    it('rejects guests with Unauthenticated', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
        expect(repository.predictions.softDeleteSnapshot).not.toHaveBeenCalled();
    });

    it("rejects a different user trying to delete someone else's snapshot", async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(
            snapshot({ userId: PREDICTIONS_USER.id }),
        );
        const yoga = createTestYoga(PREDICTIONS_OTHER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
        expect(repository.predictions.softDeleteSnapshot).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when the snapshot does not exist', async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(null);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors?.[0].extensions?.code).toBe('NOT_FOUND');
    });

    it('lets the owner soft-delete their own snapshot', async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(snapshot());
        vi.mocked(repository.predictions.softDeleteSnapshot).mockResolvedValue('snap-1');
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deletePredictionSnapshot).toBe('snap-1');
        expect(repository.predictions.softDeleteSnapshot).toHaveBeenCalledWith('snap-1');
    });

    it('lets an admin soft-delete any snapshot', async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(
            snapshot({ userId: PREDICTIONS_USER.id }),
        );
        vi.mocked(repository.predictions.softDeleteSnapshot).mockResolvedValue('snap-1');
        const yoga = createTestYoga(ADMIN_USER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deletePredictionSnapshot).toBe('snap-1');
    });

    it('is idempotent on already-deleted rows (looked up with includeDeleted)', async () => {
        const deleted = { ...snapshot(), deletedAt: new Date() };
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(deleted);
        vi.mocked(repository.predictions.softDeleteSnapshot).mockResolvedValue('snap-1');
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deletePredictionSnapshot).toBe('snap-1');
        expect(repository.predictions.getSnapshotById).toHaveBeenCalledWith({
            id: 'snap-1',
            includeDeleted: true,
        });
    });
});

// ---------------------------------------------------------------------------
// Query.predictionSnapshot
// ---------------------------------------------------------------------------
describe('Query.predictionSnapshot', () => {
    const QUERY = `query($id: ID!) { predictionSnapshot(id: $id) { id userId } }`;

    it('returns null for guests (no ability rules)', async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(snapshot());
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.predictionSnapshot).toBeNull();
    });

    it("returns null when the viewer isn't the owner and isn't admin", async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(
            snapshot({ userId: PREDICTIONS_USER.id }),
        );
        const yoga = createTestYoga(PREDICTIONS_OTHER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.predictionSnapshot).toBeNull();
    });

    it('returns the snapshot to the owner', async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(snapshot());
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors).toBeUndefined();
        expect((result.data?.predictionSnapshot as { id: string }).id).toBe('snap-1');
    });

    it('returns the snapshot to an admin', async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(
            snapshot({ userId: PREDICTIONS_USER.id }),
        );
        const yoga = createTestYoga(ADMIN_USER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.errors).toBeUndefined();
        expect((result.data?.predictionSnapshot as { userId: string }).userId).toBe(
            PREDICTIONS_USER.id,
        );
    });

    it('returns null for soft-deleted rows (repository hides them by default)', async () => {
        vi.mocked(repository.predictions.getSnapshotById).mockResolvedValue(null);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: 'snap-1' });
        expect(result.data?.predictionSnapshot).toBeNull();
        expect(repository.predictions.getSnapshotById).toHaveBeenCalledWith({ id: 'snap-1' });
    });
});

// ---------------------------------------------------------------------------
// Query.myPredictions
// ---------------------------------------------------------------------------
describe('Query.myPredictions', () => {
    const QUERY = `
        query($seasonId: ID!, $type: PredictionType!) {
            myPredictions(seasonId: $seasonId, type: $type) { id }
        }
    `;

    it('returns [] for guests rather than throwing', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { seasonId: SEASON_ID, type: 'PROJECTED_FINISH' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.myPredictions).toEqual([]);
        expect(repository.predictions.listSnapshots).not.toHaveBeenCalled();
    });

    it('lists snapshots scoped to the viewer', async () => {
        vi.mocked(repository.predictions.listSnapshots).mockResolvedValue([
            snapshot({ id: 'a' }),
            snapshot({ id: 'b' }),
        ]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { seasonId: SEASON_ID, type: 'PROJECTED_FINISH' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.myPredictions).toEqual([{ id: 'a' }, { id: 'b' }]);
        expect(repository.predictions.listSnapshots).toHaveBeenCalledWith({
            userId: PREDICTIONS_USER.id,
            seasonId: SEASON_ID,
            type: 'projected_finish',
        });
    });
});
