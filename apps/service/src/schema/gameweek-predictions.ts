/**
 * Gameweek-predictions GraphQL surface (issue #144).
 *
 * Per-pick lock model: there is no "lock in this whole slip" button.
 * Each `submitGameweekPick` appends a new immutable row to the pick
 * ledger; the latest row per (prediction, fixture) is the "current"
 * pick and the chain is the audit trail. Container creation is lazy.
 *
 * Authorization goes through CASL only — see [[../auth/abilities.ts]]:
 *   - create:    `'predictions'` role unconditionally. Covers both
 *                container creation and pick inserts (picks are part
 *                of the aggregate).
 *   - read/delete: owner (`userId === viewer.id`) OR admin via
 *                  `manage all`.
 *
 * The viewer-returns-null pattern mirrors [[./viewer.ts]] /
 * [[./predictions.ts]]: queries that the viewer can't read return
 * null instead of throwing, so the UI can render a signed-out / not-
 * mine state without error handling.
 */
import { subject } from '@casl/ability';
import { GraphQLError } from 'graphql';

import * as schema from '../db/schema';
import { repository } from '../repositories';
import type {
    GameweekPredictionPickRow,
    GameweekPredictionRow,
} from '../repositories/gameweek-predictions';
import { abilityOf, builder } from './builder';
import { FixtureRef } from './football';

type FixtureRow = typeof schema.fixtures.$inferSelect;

/**
 * Max gameweek-prediction snapshots per `(user, season)`. The earlier
 * 250 was scoped against a 1-snapshot-per-week-but-with-history model;
 * since v1 only allows one live slip per week the natural ceiling is
 * the number of gameweeks in the season (~38 for EPL). 250 leaves
 * headroom for soft-deleted rows plus a few resubmits per scope
 * (each soft-delete + new submit eats one slot).
 */
const SLIP_CAP = 250;

/** Soft cap for per-pick note text. Resolver-enforced; no DB constraint. */
const NOTE_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// Object refs
// ---------------------------------------------------------------------------

const GameweekPredictionPickRef =
    builder.objectRef<GameweekPredictionPickRow>('GameweekPredictionPick');

builder.objectType(GameweekPredictionPickRef, {
    description:
        "One row in a slip's append-only pick ledger. The latest row per `(prediction, fixture)` is the user's current pick; older rows form the per-fixture history. Pick rows are immutable — committing a change inserts a new row.",
    fields: (t) => ({
        id: t.exposeID('id', {
            description:
                "Stable UUID. Used by the per-fixture history popover and any future deep-link to a specific commit.",
        }),
        fixtureId: t.exposeID('fixtureId', {
            description: "UUID of the fixture this pick is for.",
        }),
        fixture: t.field({
            type: FixtureRef,
            nullable: true,
            description:
                "Resolved Fixture object (logos, teams, status, scheduledAt). DataLoader-batched per request.",
            resolve: (parent, _args, ctx) => ctx.loaders.fixtureLoader.load(parent.fixtureId),
        }),
        homeGoals: t.exposeInt('homeGoals', {
            nullable: true,
            description:
                'Predicted home goals. Null = the user left it blank when committing (partial picks are allowed).',
        }),
        awayGoals: t.exposeInt('awayGoals', {
            nullable: true,
            description:
                'Predicted away goals. Null = the user left it blank when committing.',
        }),
        note: t.exposeString('note', {
            nullable: true,
            description: 'Free-text per-fixture note. Capped at 500 chars by the resolver.',
        }),
        manuallyAdded: t.exposeBoolean('manuallyAdded', {
            description:
                "True when the fixture was pulled into this slip via the 'Add fixture' popup (rescheduled cup / midweek game in the between-gameweek window).",
        }),
        createdAt: t.expose('createdAt', {
            type: 'DateTime',
            description:
                "When this pick was committed. Doubles as the row's `lockedAt` — there is no separate lock column.",
        }),
    }),
});

const GameweekPredictionRef = builder.objectRef<GameweekPredictionRow>('GameweekPrediction');

builder.objectType(GameweekPredictionRef, {
    description:
        "A user's score-pick slip for one gameweek. One live slip per `(user, season, gameweek)`. Soft-deletable. The slip itself is a thin container; the picks (and their history) live in `picks` / `pickHistory`.",
    fields: (t) => ({
        id: t.exposeID('id', {
            description: 'Stable UUID. Used by `Query.gameweekPrediction` and the history panel.',
        }),
        userId: t.exposeID('userId', {
            description:
                'Owner (domain user UUID). Only the owner or an admin can read this slip.',
        }),
        seasonId: t.exposeID('seasonId', { description: 'Season this slip is for.' }),
        gameweek: t.exposeInt('gameweek', { description: 'Gameweek number being predicted.' }),
        createdAt: t.expose('createdAt', {
            type: 'DateTime',
            description: 'When the container was lazily created (i.e. first pick committed).',
        }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description:
                "Bumps on every committed pick. The history panel sorts slips by this to put 'newest activity' on top.",
        }),
        deletedAt: t.expose('deletedAt', {
            type: 'DateTime',
            nullable: true,
            description:
                "Set when the slip was soft-deleted. Live queries filter these out — surfaced here for admin tooling.",
        }),
        picks: t.field({
            type: [GameweekPredictionPickRef],
            description:
                "Current picks — one entry per fixture, the latest row in each chain. DataLoader-batched.",
            resolve: (parent, _args, ctx) => ctx.loaders.gameweekPickCurrentLoader.load(parent.id),
        }),
        pickHistory: t.field({
            type: [GameweekPredictionPickRef],
            description:
                "Full pick chain for this slip, newest first. Powers the per-fixture history popover. DataLoader-batched.",
            resolve: (parent, _args, ctx) => ctx.loaders.gameweekPickHistoryLoader.load(parent.id),
        }),
    }),
});

interface GameweekFixturesPayloadShape {
    gameweek: number;
    fixtures: FixtureRow[];
    recommended: FixtureRow[];
}

const GameweekFixturesPayloadRef =
    builder.objectRef<GameweekFixturesPayloadShape>('GameweekFixturesPayload');

builder.objectType(GameweekFixturesPayloadRef, {
    description:
        "Editor-ready fixture lookup for a `(season, gameweek)`. `fixtures` is every fixture in the gameweek (any status — the UI greys out non-`scheduled` rows). `recommended` is the auto-derived rescheduled-window set for the 'Add fixture' popup.",
    fields: (t) => ({
        gameweek: t.exposeInt('gameweek', { description: 'Echo of the requested gameweek.' }),
        fixtures: t.field({
            type: [FixtureRef],
            description: 'Every fixture in this gameweek, any status, sorted by scheduledAt.',
            resolve: (parent) => parent.fixtures,
        }),
        recommended: t.field({
            type: [FixtureRef],
            description:
                "`status='scheduled'` fixtures whose `scheduledAt` sits between the previous gameweek's latest and the next gameweek's earliest. Empty for the first/last gameweek.",
            resolve: (parent) => parent.recommended,
        }),
    }),
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const SubmitGameweekPickInput = builder.inputType('SubmitGameweekPickInput', {
    description:
        "Payload for `submitGameweekPick`. The resolver lazily creates the slip on the first call for a `(season, gameweek)`, dedups identical re-submits, and enforces the GAMEWEEK_CLOSED / INVALID_MANUAL_ADD guards.",
    fields: (t) => ({
        seasonId: t.id({ required: true }),
        gameweek: t.int({ required: true }),
        fixtureId: t.id({ required: true }),
        homeGoals: t.int({ required: false, description: 'Null = blank.' }),
        awayGoals: t.int({ required: false, description: 'Null = blank.' }),
        note: t.string({ required: false, description: 'Optional free text. ≤ 500 chars.' }),
        manuallyAdded: t.boolean({
            required: false,
            description:
                "Mark true for fixtures pulled in via the 'Add fixture' popup. Server validates the rescheduled-window rule and rejects with INVALID_MANUAL_ADD otherwise.",
        }),
    }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Throws a structured `BAD_REQUEST` if `note` is over the soft cap. Resolver-
 * side (rather than CHECK constraint) so the limit can move without a
 * migration.
 */
function assertNoteLength(note: string | null | undefined): void {
    if (note != null && note.length > NOTE_MAX_LENGTH) {
        throw new GraphQLError(`Note must be ≤ ${NOTE_MAX_LENGTH} characters`, {
            extensions: { code: 'NOTE_TOO_LONG', http: { status: 400 } },
        });
    }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryField('myGameweekPredictions', (t) =>
    t.field({
        type: [GameweekPredictionRef],
        description:
            "The viewer's live gameweek slips for a season, newest activity first. Returns `[]` for unauthenticated callers (rather than 401) so the page can render a signed-out state without error handling.",
        args: { seasonId: t.arg.id({ required: true }) },
        resolve: async (_root, { seasonId }, ctx) => {
            if (!ctx.user) return [];
            if (abilityOf(ctx).cannot('read', 'GameweekPrediction')) return [];
            return repository.gameweekPredictions.listPredictionsForUser({
                userId: ctx.user.id,
                seasonId: seasonId as string,
            });
        },
    }),
);

builder.queryField('gameweekPrediction', (t) =>
    t.field({
        type: GameweekPredictionRef,
        nullable: true,
        description:
            "Returns the slip when the viewer is the owner or an admin, otherwise null. Soft-deleted rows are treated as non-existent.",
        args: { id: t.arg.id({ required: true }) },
        resolve: async (_root, { id }, ctx) => {
            const row = await repository.gameweekPredictions.getPredictionById({
                id: id as string,
            });
            if (!row) return null;
            if (
                abilityOf(ctx).cannot(
                    'read',
                    subject('GameweekPrediction', { userId: row.userId }),
                )
            ) {
                return null;
            }
            return row;
        },
    }),
);

builder.queryField('gameweekPredictionForWeek', (t) =>
    t.field({
        type: GameweekPredictionRef,
        nullable: true,
        description:
            "The viewer's live slip for `(season, gameweek)`, or null when none exists. Used by the editor to decide between 'create new' and 'show existing'.",
        args: {
            seasonId: t.arg.id({ required: true }),
            gameweek: t.arg.int({ required: true }),
        },
        resolve: async (_root, { seasonId, gameweek }, ctx) => {
            if (!ctx.user) return null;
            if (abilityOf(ctx).cannot('read', 'GameweekPrediction')) return null;
            return repository.gameweekPredictions.getPredictionForWeek({
                userId: ctx.user.id,
                seasonId: seasonId as string,
                gameweek,
            });
        },
    }),
);

builder.queryField('activeGameweek', (t) =>
    t.int({
        nullable: true,
        description:
            'Default landing gameweek for the editor — earliest gameweek in the season with at least one `scheduled` fixture. Null once the season is fully played.',
        args: { seasonId: t.arg.id({ required: true }) },
        resolve: (_root, { seasonId }) =>
            repository.fixtures.getActiveGameweek(seasonId as string),
    }),
);

builder.queryField('selectableGameweeks', (t) =>
    t.field({
        type: ['Int'],
        description:
            'Gameweeks with at least one `scheduled` fixture remaining. Powers the Gameweek picker — the set shrinks across the season. Sorted ascending.',
        args: { seasonId: t.arg.id({ required: true }) },
        resolve: (_root, { seasonId }) =>
            repository.fixtures.listSelectableGameweeks(seasonId as string),
    }),
);

interface SelectableGameweekShape {
    gameweek: number;
    nextKickoff: Date;
}

const SelectableGameweekRef = builder.simpleObject('SelectableGameweek', {
    description:
        'A gameweek the user can still pick (has at least one `scheduled` fixture remaining), paired with the earliest scheduled kickoff in that gameweek.',
    fields: (t) => ({
        gameweek: t.int({ description: 'Gameweek number.' }),
        nextKickoff: t.field({
            type: 'DateTime',
            description: "Earliest `scheduledAt` among the gameweek's scheduled fixtures.",
        }),
    }),
});

builder.queryField('selectableGameweeksByKickoff', (t) =>
    t.field({
        type: [SelectableGameweekRef],
        description:
            "Selectable gameweeks sorted by next scheduled kickoff (soonest first). Used by the Add-gameweek dialog so the slip the user is most likely to want — \"what's playing soon?\" — is on top. A gameweek with all matches played except one rescheduled stray sorts to where that stray sits in the calendar, not near the top by gameweek number.",
        args: { seasonId: t.arg.id({ required: true }) },
        resolve: async (_root, { seasonId }): Promise<SelectableGameweekShape[]> =>
            repository.fixtures.listSelectableGameweeksByNextKickoff(seasonId as string),
    }),
);

builder.queryField('gameweekFixturesForPredictions', (t) =>
    t.field({
        type: GameweekFixturesPayloadRef,
        description:
            "Fixture lookup for the editor: every fixture in the gameweek (any status), plus the rescheduled-window 'recommended' set the 'Add fixture' popup shows.",
        args: {
            seasonId: t.arg.id({ required: true }),
            gameweek: t.arg.int({ required: true }),
        },
        resolve: async (_root, { seasonId, gameweek }) => {
            const [fixtures, recommended] = await Promise.all([
                repository.fixtures.getFixturesByGameweek(seasonId as string, gameweek),
                repository.fixtures.getRecommendedRescheduledFixtures(
                    seasonId as string,
                    gameweek,
                ),
            ]);
            return { gameweek, fixtures, recommended };
        },
    }),
);

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

builder.mutationField('submitGameweekPick', (t) =>
    t.field({
        type: GameweekPredictionPickRef,
        description:
            "Commit a single pick. Lazily creates the slip container on the first call for `(season, gameweek)`. Identical re-submits dedup server-side (no new row, no `updatedAt` bump). Guards: GAMEWEEK_CLOSED (no scoreable fixtures left), fixture must be `status='scheduled'`, INVALID_MANUAL_ADD (manually-added fixtures must match the rescheduled-window rule).",
        args: { input: t.arg({ type: SubmitGameweekPickInput, required: true }) },
        resolve: async (_root, { input }, ctx) => {
            if (!ctx.user) {
                throw new GraphQLError('Unauthenticated', {
                    extensions: { http: { status: 401 } },
                });
            }
            if (abilityOf(ctx).cannot('create', 'GameweekPrediction')) {
                throw new GraphQLError('Forbidden', {
                    extensions: { http: { status: 403 } },
                });
            }

            const seasonId = input.seasonId as string;
            const fixtureId = input.fixtureId as string;
            const manuallyAdded = input.manuallyAdded ?? false;
            const note = input.note ?? null;
            assertNoteLength(note);

            // Cap guard — count both live and soft-deleted slips so a
            // create/delete loop can't bypass. Cheap O(1)-ish count.
            const slipCount = (
                await repository.gameweekPredictions.listPredictionsForUser({
                    userId: ctx.user.id,
                    seasonId,
                    includeDeleted: true,
                })
            ).length;
            // The cap only matters when the user is about to create a *new*
            // container — appending picks to an existing live slip is free.
            const existingLive = await repository.gameweekPredictions.getPredictionForWeek({
                userId: ctx.user.id,
                seasonId,
                gameweek: input.gameweek,
            });
            if (!existingLive && slipCount >= SLIP_CAP) {
                throw new GraphQLError(
                    `Gameweek prediction limit reached (${slipCount}/${SLIP_CAP})`,
                    {
                        extensions: {
                            code: 'GAMEWEEK_PREDICTION_LIMIT_REACHED',
                            http: { status: 409 },
                            count: slipCount,
                            limit: SLIP_CAP,
                        },
                    },
                );
            }

            // Fixture must exist, belong to this season, and be scoreable.
            const fixture = await repository.fixtures.getFixtureById(fixtureId);
            if (!fixture || fixture.seasonId !== seasonId) {
                throw new GraphQLError('Fixture not in season', {
                    extensions: { code: 'INVALID_FIXTURE', http: { status: 400 } },
                });
            }
            if (fixture.status !== 'scheduled') {
                throw new GraphQLError(
                    `Cannot pick a ${fixture.status} fixture`,
                    {
                        extensions: { code: 'FIXTURE_NOT_SCOREABLE', http: { status: 409 } },
                    },
                );
            }

            // GAMEWEEK_CLOSED — gameweek has no scoreable fixtures (the one
            // we're about to pick must be one of them, but the user might be
            // submitting against an obviously-stale gameweek by id).
            const selectable = await repository.fixtures.listSelectableGameweeks(seasonId);
            if (!selectable.includes(input.gameweek)) {
                throw new GraphQLError(
                    `Gameweek ${input.gameweek} has no scoreable fixtures left`,
                    {
                        extensions: { code: 'GAMEWEEK_CLOSED', http: { status: 409 } },
                    },
                );
            }

            // INVALID_MANUAL_ADD — a manual-add must be in the rescheduled
            // window for THIS slip's gameweek. The frontend can lie; we
            // re-derive the allowed set and reject anything outside.
            if (manuallyAdded) {
                const recommended =
                    await repository.fixtures.getRecommendedRescheduledFixtures(
                        seasonId,
                        input.gameweek,
                    );
                const allowedIds = new Set(recommended.map((f) => f.id));
                if (!allowedIds.has(fixtureId)) {
                    throw new GraphQLError(
                        'Fixture is not in the rescheduled window for this gameweek',
                        {
                            extensions: {
                                code: 'INVALID_MANUAL_ADD',
                                http: { status: 400 },
                            },
                        },
                    );
                }
            } else if (fixture.gameweek !== input.gameweek) {
                // Non-manual picks must belong to the slip's gameweek.
                throw new GraphQLError(
                    `Fixture is in gameweek ${fixture.gameweek}, not ${input.gameweek}`,
                    {
                        extensions: { code: 'INVALID_FIXTURE', http: { status: 400 } },
                    },
                );
            }

            const result = await repository.gameweekPredictions.submitPick({
                userId: ctx.user.id,
                seasonId,
                gameweek: input.gameweek,
                fixtureId,
                homeGoals: input.homeGoals ?? null,
                awayGoals: input.awayGoals ?? null,
                note,
                manuallyAdded,
            });
            return result.pick;
        },
    }),
);

builder.mutationField('deleteGameweekPrediction', (t) =>
    t.id({
        description:
            "Soft-delete a slip (sets `deletedAt`). Idempotent on already-deleted rows. Owner or admin only. Returns the slip id.",
        args: { id: t.arg.id({ required: true }) },
        resolve: async (_root, { id }, ctx) => {
            if (!ctx.user) {
                throw new GraphQLError('Unauthenticated', {
                    extensions: { http: { status: 401 } },
                });
            }
            const row = await repository.gameweekPredictions.getPredictionById({
                id: id as string,
                includeDeleted: true,
            });
            if (!row) {
                throw new GraphQLError('Gameweek prediction not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'delete',
                    subject('GameweekPrediction', { userId: row.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', {
                    extensions: { http: { status: 403 } },
                });
            }
            const deletedId =
                await repository.gameweekPredictions.softDeletePrediction(row.id);
            return deletedId ?? row.id;
        },
    }),
);
