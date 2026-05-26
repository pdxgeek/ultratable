/**
 * Gameweek-predictions resolver tests (issue #144).
 *
 * Covers the auth matrix (owner / non-owner / admin / guest), the
 * resolver-side guards (GAMEWEEK_CLOSED, FIXTURE_NOT_SCOREABLE,
 * INVALID_FIXTURE, INVALID_MANUAL_ADD, NOTE_TOO_LONG,
 * GAMEWEEK_PREDICTION_LIMIT_REACHED), and the soft-delete idempotency
 * path. Repository + fixtures repo are the type-checked mocks, so this
 * file pins the resolver contract without touching Postgres — the real
 * DB round-trip is exercised in
 * `repositories/gameweek-predictions.repository.integration.test.ts`.
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { abilityFor } from '../auth/abilities';
import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { builder } from './builder';

import './viewer';
// `./football` registers `FixtureRef`, which `GameweekPredictionPick.fixture`
// and `GameweekFixturesPayload.{fixtures,recommended}` refer to. Without it,
// schema construction fails with "<unnamed ref or enum> has not been
// implemented" — mirrors the pattern in `tier-lists.test.ts`.
import './football';
import './gameweek-predictions';

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
const FIXTURE_GW1 = '00000000-0000-0000-0000-0000000000f1';
const FIXTURE_GW1_OTHER = '00000000-0000-0000-0000-0000000000f2';
const FIXTURE_CUP = '00000000-0000-0000-0000-0000000000fc';
const FIXTURE_PLAYED = '00000000-0000-0000-0000-0000000000fp';
const PRED_ID = '00000000-0000-0000-0000-0000000000a1';
const PICK_ID = '00000000-0000-0000-0000-0000000000b1';

function scheduledFixture(id: string, gameweek: number | null) {
    return {
        id,
        leagueId: 'league-1',
        seasonId: SEASON_ID,
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        venueId: null,
        status: 'scheduled' as const,
        scheduledAt: new Date('2024-08-10T15:00:00Z'),
        homeGoals: null,
        awayGoals: null,
        sourceName: 'test',
        sourceId: 1,
        gameweek,
        metadata: null,
        rawResponse: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

function predictionRow(overrides: Partial<{ id: string; userId: string; gameweek: number }> = {}) {
    return {
        id: overrides.id ?? PRED_ID,
        userId: overrides.userId ?? PREDICTIONS_USER.id,
        seasonId: SEASON_ID,
        gameweek: overrides.gameweek ?? 1,
        createdAt: new Date('2024-08-10T12:00:00Z'),
        updatedAt: new Date('2024-08-10T12:00:00Z'),
        deletedAt: null,
    };
}

function pickRow(overrides: Partial<{ id: string; predictionId: string }> = {}) {
    return {
        id: overrides.id ?? PICK_ID,
        predictionId: overrides.predictionId ?? PRED_ID,
        fixtureId: FIXTURE_GW1,
        homeGoals: 2,
        awayGoals: 1,
        note: null,
        manuallyAdded: false,
        createdAt: new Date('2024-08-10T12:00:00Z'),
    };
}

function withDefaultMocks(): void {
    vi.mocked(repository.fixtures.getFixtureById).mockResolvedValue(scheduledFixture(FIXTURE_GW1, 1));
    vi.mocked(repository.fixtures.listSelectableGameweeks).mockResolvedValue([1, 2]);
    vi.mocked(repository.fixtures.getRecommendedRescheduledFixtures).mockResolvedValue([]);
    vi.mocked(repository.gameweekPredictions.listPredictionsForUser).mockResolvedValue([]);
    vi.mocked(repository.gameweekPredictions.getPredictionForWeek).mockResolvedValue(null);
    vi.mocked(repository.gameweekPredictions.submitPick).mockResolvedValue({
        prediction: predictionRow(),
        pick: pickRow(),
        deduped: false,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    withDefaultMocks();
});

// ---------------------------------------------------------------------------
// Mutation.submitGameweekPick
// ---------------------------------------------------------------------------
describe('Mutation.submitGameweekPick', () => {
    const QUERY = `
        mutation($input: SubmitGameweekPickInput!) {
            submitGameweekPick(input: $input) {
                id fixtureId homeGoals awayGoals note manuallyAdded
            }
        }
    `;

    function input(overrides: Record<string, unknown> = {}) {
        return {
            input: {
                seasonId: SEASON_ID,
                gameweek: 1,
                fixtureId: FIXTURE_GW1,
                homeGoals: 2,
                awayGoals: 1,
                ...overrides,
            },
        };
    }

    it('rejects guests with Unauthenticated', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
        expect(repository.gameweekPredictions.submitPick).not.toHaveBeenCalled();
    });

    it('rejects users without the predictions role with Forbidden', async () => {
        const yoga = createTestYoga(PLAIN_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
        expect(repository.gameweekPredictions.submitPick).not.toHaveBeenCalled();
    });

    it('rejects an unknown / out-of-season fixture with INVALID_FIXTURE', async () => {
        vi.mocked(repository.fixtures.getFixtureById).mockResolvedValue(null);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_FIXTURE');
        expect(repository.gameweekPredictions.submitPick).not.toHaveBeenCalled();
    });

    it('rejects a non-scheduled fixture with FIXTURE_NOT_SCOREABLE', async () => {
        vi.mocked(repository.fixtures.getFixtureById).mockResolvedValue({
            ...scheduledFixture(FIXTURE_PLAYED, 1),
            status: 'played',
        });
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input({ fixtureId: FIXTURE_PLAYED }));
        expect(result.errors?.[0].extensions?.code).toBe('FIXTURE_NOT_SCOREABLE');
    });

    it('rejects a gameweek with no scoreable fixtures with GAMEWEEK_CLOSED', async () => {
        vi.mocked(repository.fixtures.listSelectableGameweeks).mockResolvedValue([2]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input({ gameweek: 1 }));
        expect(result.errors?.[0].extensions?.code).toBe('GAMEWEEK_CLOSED');
        expect(repository.gameweekPredictions.submitPick).not.toHaveBeenCalled();
    });

    it('rejects a non-manual pick whose fixture belongs to another gameweek', async () => {
        vi.mocked(repository.fixtures.getFixtureById).mockResolvedValue(
            scheduledFixture(FIXTURE_GW1_OTHER, 2),
        );
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input({ fixtureId: FIXTURE_GW1_OTHER }));
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_FIXTURE');
    });

    it('rejects a manual-add fixture outside the rescheduled window with INVALID_MANUAL_ADD', async () => {
        // Fixture exists, scheduled, null gameweek (a cup tie), but not in
        // the recommended window for GW1.
        vi.mocked(repository.fixtures.getFixtureById).mockResolvedValue(
            scheduledFixture(FIXTURE_CUP, null),
        );
        vi.mocked(repository.fixtures.getRecommendedRescheduledFixtures).mockResolvedValue([]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(
            yoga,
            QUERY,
            input({ fixtureId: FIXTURE_CUP, manuallyAdded: true }),
        );
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_MANUAL_ADD');
    });

    it('accepts a manual-add fixture in the rescheduled window', async () => {
        vi.mocked(repository.fixtures.getFixtureById).mockResolvedValue(
            scheduledFixture(FIXTURE_CUP, null),
        );
        vi.mocked(repository.fixtures.getRecommendedRescheduledFixtures).mockResolvedValue([
            scheduledFixture(FIXTURE_CUP, null),
        ]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(
            yoga,
            QUERY,
            input({ fixtureId: FIXTURE_CUP, manuallyAdded: true }),
        );
        expect(result.errors).toBeUndefined();
        expect(repository.gameweekPredictions.submitPick).toHaveBeenCalledWith(
            expect.objectContaining({ fixtureId: FIXTURE_CUP, manuallyAdded: true }),
        );
    });

    it('rejects a note over 500 chars with NOTE_TOO_LONG', async () => {
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input({ note: 'a'.repeat(501) }));
        expect(result.errors?.[0].extensions?.code).toBe('NOTE_TOO_LONG');
    });

    it('rejects a new-container submit past the slip cap with GAMEWEEK_PREDICTION_LIMIT_REACHED', async () => {
        const oversized = Array.from({ length: 250 }, (_, i) =>
            predictionRow({ id: `pred-${i}`, gameweek: i + 1 }),
        );
        vi.mocked(repository.gameweekPredictions.listPredictionsForUser).mockResolvedValue(
            oversized,
        );
        vi.mocked(repository.gameweekPredictions.getPredictionForWeek).mockResolvedValue(null);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input({ gameweek: 999 }));
        expect(result.errors?.[0].extensions?.code).toBe('GAMEWEEK_PREDICTION_LIMIT_REACHED');
        expect(result.errors?.[0].extensions?.limit).toBe(250);
    });

    it('allows appending to an existing slip even when the cap would block a new one', async () => {
        const oversized = Array.from({ length: 250 }, (_, i) =>
            predictionRow({ id: `pred-${i}`, gameweek: i + 1 }),
        );
        vi.mocked(repository.gameweekPredictions.listPredictionsForUser).mockResolvedValue(
            oversized,
        );
        vi.mocked(repository.gameweekPredictions.getPredictionForWeek).mockResolvedValue(
            predictionRow(),
        );
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors).toBeUndefined();
        expect(repository.gameweekPredictions.submitPick).toHaveBeenCalled();
    });

    it('passes the viewer id from ctx (clients cannot target another user)', async () => {
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors).toBeUndefined();
        expect(repository.gameweekPredictions.submitPick).toHaveBeenCalledWith(
            expect.objectContaining({ userId: PREDICTIONS_USER.id }),
        );
    });

    it('lets admins submit even without the predictions role', async () => {
        const yoga = createTestYoga(ADMIN_USER);
        const result = await gql(yoga, QUERY, input());
        expect(result.errors).toBeUndefined();
        expect(repository.gameweekPredictions.submitPick).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Mutation.deleteGameweekPrediction
// ---------------------------------------------------------------------------
describe('Mutation.deleteGameweekPrediction', () => {
    const QUERY = `
        mutation($id: ID!) {
            deleteGameweekPrediction(id: $id)
        }
    `;

    it('rejects guests', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
    });

    it('404s when the slip does not exist', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(null);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors?.[0].extensions?.code).toBe('NOT_FOUND');
    });

    it('rejects non-owners with Forbidden', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(
            predictionRow({ userId: PREDICTIONS_OTHER.id }),
        );
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
        expect(repository.gameweekPredictions.softDeletePrediction).not.toHaveBeenCalled();
    });

    it('soft-deletes owner slip and returns its id', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(
            predictionRow(),
        );
        vi.mocked(repository.gameweekPredictions.softDeletePrediction).mockResolvedValue(PRED_ID);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deleteGameweekPrediction).toBe(PRED_ID);
    });

    it('is idempotent — re-deleting still returns the id', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue({
            ...predictionRow(),
            deletedAt: new Date(),
        });
        vi.mocked(repository.gameweekPredictions.softDeletePrediction).mockResolvedValue(PRED_ID);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deleteGameweekPrediction).toBe(PRED_ID);
    });

    it('admins can soft-delete others slips via manage all', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(
            predictionRow({ userId: PREDICTIONS_USER.id }),
        );
        vi.mocked(repository.gameweekPredictions.softDeletePrediction).mockResolvedValue(PRED_ID);
        const yoga = createTestYoga(ADMIN_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Query.gameweekPrediction
// ---------------------------------------------------------------------------
describe('Query.gameweekPrediction', () => {
    const QUERY = `
        query($id: ID!) {
            gameweekPrediction(id: $id) {
                id userId gameweek
            }
        }
    `;

    it('returns the slip for the owner', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(
            predictionRow(),
        );
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors).toBeUndefined();
        expect(
            (result.data?.gameweekPrediction as { id: string } | null)?.id,
        ).toBe(PRED_ID);
    });

    it('returns null (viewer-returns-null) for a non-owner', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(
            predictionRow({ userId: PREDICTIONS_OTHER.id }),
        );
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors).toBeUndefined();
        expect(result.data?.gameweekPrediction).toBeNull();
    });

    it('returns null for guests', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(
            predictionRow(),
        );
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.data?.gameweekPrediction).toBeNull();
    });

    it('admins can read others slips', async () => {
        vi.mocked(repository.gameweekPredictions.getPredictionById).mockResolvedValue(
            predictionRow({ userId: PREDICTIONS_USER.id }),
        );
        const yoga = createTestYoga(ADMIN_USER);
        const result = await gql(yoga, QUERY, { id: PRED_ID });
        expect(result.errors).toBeUndefined();
        expect(
            (result.data?.gameweekPrediction as { id: string } | null)?.id,
        ).toBe(PRED_ID);
    });
});

// ---------------------------------------------------------------------------
// Query.myGameweekPredictions
// ---------------------------------------------------------------------------
describe('Query.myGameweekPredictions', () => {
    const QUERY = `
        query($seasonId: ID!) {
            myGameweekPredictions(seasonId: $seasonId) { id gameweek }
        }
    `;

    it('returns [] for guests (no 401)', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { seasonId: SEASON_ID });
        expect(result.errors).toBeUndefined();
        expect(result.data?.myGameweekPredictions).toEqual([]);
    });

    it('returns [] for users without the predictions role', async () => {
        const yoga = createTestYoga(PLAIN_USER);
        const result = await gql(yoga, QUERY, { seasonId: SEASON_ID });
        expect(result.errors).toBeUndefined();
        expect(result.data?.myGameweekPredictions).toEqual([]);
        expect(repository.gameweekPredictions.listPredictionsForUser).not.toHaveBeenCalled();
    });

    it('lists the viewer slips for the predictions role', async () => {
        vi.mocked(repository.gameweekPredictions.listPredictionsForUser).mockResolvedValue([
            predictionRow({ id: 'a', gameweek: 1 }),
            predictionRow({ id: 'b', gameweek: 2 }),
        ]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(yoga, QUERY, { seasonId: SEASON_ID });
        expect(result.errors).toBeUndefined();
        expect((result.data?.myGameweekPredictions as Array<{ id: string }>).map((r) => r.id)).toEqual(
            ['a', 'b'],
        );
        expect(repository.gameweekPredictions.listPredictionsForUser).toHaveBeenCalledWith({
            userId: PREDICTIONS_USER.id,
            seasonId: SEASON_ID,
        });
    });
});

// ---------------------------------------------------------------------------
// Query.gameweekFixturesForPredictions / selectableGameweeks / activeGameweek
// ---------------------------------------------------------------------------
describe('Fixture-side queries', () => {
    it('gameweekFixturesForPredictions echoes the gameweek and forwards both fixture sets', async () => {
        vi.mocked(repository.fixtures.getFixturesByGameweek).mockResolvedValue([
            scheduledFixture(FIXTURE_GW1, 1),
        ]);
        vi.mocked(repository.fixtures.getRecommendedRescheduledFixtures).mockResolvedValue([
            scheduledFixture(FIXTURE_CUP, null),
        ]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(
            yoga,
            `
                query($seasonId: ID!, $gameweek: Int!) {
                    gameweekFixturesForPredictions(seasonId: $seasonId, gameweek: $gameweek) {
                        gameweek
                        fixtures { id }
                        recommended { id }
                    }
                }
            `,
            { seasonId: SEASON_ID, gameweek: 1 },
        );
        expect(result.errors).toBeUndefined();
        const payload = result.data?.gameweekFixturesForPredictions as {
            gameweek: number;
            fixtures: Array<{ id: string }>;
            recommended: Array<{ id: string }>;
        };
        expect(payload.gameweek).toBe(1);
        expect(payload.fixtures.map((f) => f.id)).toEqual([FIXTURE_GW1]);
        expect(payload.recommended.map((f) => f.id)).toEqual([FIXTURE_CUP]);
    });

    it('selectableGameweeks forwards the repo result verbatim', async () => {
        vi.mocked(repository.fixtures.listSelectableGameweeks).mockResolvedValue([3, 4, 5]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(
            yoga,
            `query($seasonId: ID!) { selectableGameweeks(seasonId: $seasonId) }`,
            { seasonId: SEASON_ID },
        );
        expect(result.data?.selectableGameweeks).toEqual([3, 4, 5]);
    });

    it('selectableGameweeksByKickoff exposes gameweek + nextKickoff in repo order', async () => {
        const aug = new Date('2024-08-17T15:00:00.000Z');
        const sep = new Date('2024-09-01T12:00:00.000Z');
        vi.mocked(
            repository.fixtures.listSelectableGameweeksByNextKickoff,
        ).mockResolvedValue([
            { gameweek: 2, nextKickoff: aug },
            { gameweek: 5, nextKickoff: sep },
        ]);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(
            yoga,
            `
                query($seasonId: ID!) {
                    selectableGameweeksByKickoff(seasonId: $seasonId) {
                        gameweek
                        nextKickoff
                    }
                }
            `,
            { seasonId: SEASON_ID },
        );
        expect(result.errors).toBeUndefined();
        expect(result.data?.selectableGameweeksByKickoff).toEqual([
            { gameweek: 2, nextKickoff: aug.toISOString() },
            { gameweek: 5, nextKickoff: sep.toISOString() },
        ]);
    });

    it('activeGameweek returns null when the season is fully played', async () => {
        vi.mocked(repository.fixtures.getActiveGameweek).mockResolvedValue(null);
        const yoga = createTestYoga(PREDICTIONS_USER);
        const result = await gql(
            yoga,
            `query($seasonId: ID!) { activeGameweek(seasonId: $seasonId) }`,
            { seasonId: SEASON_ID },
        );
        expect(result.data?.activeGameweek).toBeNull();
    });
});
