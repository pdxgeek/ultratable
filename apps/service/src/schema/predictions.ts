/**
 * Predictions GraphQL surface (issue #105).
 *
 * Snapshots are immutable: each "lock in" creates a new row. Deletion is
 * soft (sets `deletedAt`); deleted rows still count against the per-scope
 * cap so create/delete loops can't bypass it.
 *
 * Authorization goes through CASL only — see [[../auth/abilities.ts]]:
 *   - create: any user with the `predictions` role.
 *   - read/delete: owner (`userId === viewer.id`) OR admin via `manage all`.
 *
 * `Query.predictionSnapshot(id)` returns null when the viewer cannot read
 * the row (not their snapshot, not an admin, or soft-deleted) — the
 * viewer-returns-null pattern, mirroring [[./viewer.ts]].
 */
import { subject } from '@casl/ability';
import { GraphQLError } from 'graphql';

import { repository } from '../repositories';
import type {
    PredictionSnapshotRow,
    PredictionType as PredictionTypeValue,
} from '../repositories/predictions';
import { abilityOf, builder } from './builder';

/**
 * Floor for the per-(user, season, type) snapshot cap. The ceiling is
 * `max(SNAPSHOT_CAP_FLOOR, gameweekCount)` so seasons longer than 50
 * gameweeks still let users predict every week.
 */
const SNAPSHOT_CAP_FLOOR = 50;

const PredictionType = builder.enumType('PredictionType', {
    description:
        'Discriminator for a prediction snapshot. Today only `PROJECTED_FINISH` exists; new variants (e.g. per-gameweek picks) will be added here.',
    values: {
        PROJECTED_FINISH: {
            value: 'projected_finish' as const,
            description: 'Predicted final-standings order for the season.',
        },
    },
});

const LockInPredictionInput = builder.inputType('LockInPredictionInput', {
    description:
        'Payload for `lockInPrediction`. `orderedTeamIds` must contain every team in the season exactly once — position is inferred from array order (index 0 = position 1).',
    fields: (t) => ({
        seasonId: t.id({ required: true }),
        type: t.field({ type: PredictionType, required: true }),
        orderedTeamIds: t.idList({ required: true }),
    }),
});

const PredictionSnapshotEntryRef = builder.simpleObject('PredictionSnapshotEntry', {
    description: "One team's predicted finishing position within a snapshot.",
    fields: (t) => ({
        teamId: t.id({ description: 'UUID of the predicted team.' }),
        position: t.int({
            description:
                "Predicted finishing position (1 = top). Unique within the snapshot.",
        }),
    }),
});

const PredictionSnapshotRef = builder.objectRef<PredictionSnapshotRow>('PredictionSnapshot');

builder.objectType(PredictionSnapshotRef, {
    description:
        "An immutable snapshot of a viewer's prediction. Identified by a stable UUID — share this id, not the internal numeric position.",
    fields: (t) => ({
        id: t.exposeID('id', {
            description:
                'Stable UUID. Used by `Query.predictionSnapshot`, future shareable URLs, and admin tooling.',
        }),
        userId: t.exposeID('userId', {
            description:
                'Owner (domain user UUID). Only the owner or an admin can read this snapshot.',
        }),
        seasonId: t.exposeID('seasonId', { description: 'Season this prediction is for.' }),
        type: t.field({
            type: PredictionType,
            description: 'Discriminator — see `PredictionType`.',
            resolve: (parent) => parent.type,
        }),
        lockedAt: t.expose('lockedAt', {
            type: 'DateTime',
            nullable: true,
            description:
                "When the snapshot was locked in. Non-null for `PROJECTED_FINISH` (immutable). Null on `GAMEWEEK` snapshots while unlocked; set on each lock/re-lock.",
        }),
        deletedAt: t.expose('deletedAt', {
            type: 'DateTime',
            nullable: true,
            description:
                "Set when the snapshot was soft-deleted. Live queries filter these out — surfaced here for admin tooling only.",
        }),
        entries: t.field({
            type: [PredictionSnapshotEntryRef],
            description: 'Predicted teams in order (position 1..N).',
            resolve: (parent, _args, ctx) => ctx.loaders.predictionEntriesLoader.load(parent.id),
        }),
    }),
});

builder.queryField('myPredictions', (t) =>
    t.field({
        type: [PredictionSnapshotRef],
        description:
            "The viewer's prediction snapshots for a season/type, newest first. Returns [] for unauthenticated callers (rather than 401) so the predictions page can render a signed-out state without error handling.",
        args: {
            seasonId: t.arg.id({ required: true }),
            type: t.arg({ type: PredictionType, required: true }),
        },
        resolve: async (_root, { seasonId, type }, ctx) => {
            if (!ctx.user) return [];
            if (abilityOf(ctx).cannot('read', 'Prediction')) return [];
            return repository.predictions.listSnapshots({
                userId: ctx.user.id,
                seasonId: seasonId as string,
                type,
            });
        },
    }),
);

builder.queryField('predictionSnapshot', (t) =>
    t.field({
        type: PredictionSnapshotRef,
        nullable: true,
        description:
            'Returns the snapshot when the viewer is the owner or an admin, otherwise null. Soft-deleted rows are treated as non-existent.',
        args: { id: t.arg.id({ required: true }) },
        resolve: async (_root, { id }, ctx) => {
            const snapshot = await repository.predictions.getSnapshotById({ id: id as string });
            if (!snapshot) return null;
            if (
                abilityOf(ctx).cannot(
                    'read',
                    subject('Prediction', { userId: snapshot.userId }),
                )
            ) {
                return null;
            }
            return snapshot;
        },
    }),
);

builder.mutationField('lockInPrediction', (t) =>
    t.field({
        type: PredictionSnapshotRef,
        description:
            "Create a new prediction snapshot for the viewer. `orderedTeamIds` must be a permutation of the season's teams. Enforces a per-(user, season, type) cap that counts soft-deleted rows too.",
        args: {
            input: t.arg({ type: LockInPredictionInput, required: true }),
        },
        resolve: async (_root, { input }, ctx) => {
            if (!ctx.user) {
                throw new GraphQLError('Unauthenticated', {
                    extensions: { http: { status: 401 } },
                });
            }
            if (abilityOf(ctx).cannot('create', 'Prediction')) {
                throw new GraphQLError('Forbidden', {
                    extensions: { http: { status: 403 } },
                });
            }

            const seasonId = input.seasonId as string;
            const orderedTeamIds = input.orderedTeamIds as string[];

            // Payload validation: every team in the season, exactly once.
            const seasonTeams = await repository.teams.getTeamsBySeasonId(seasonId);
            if (seasonTeams.length === 0) {
                throw new GraphQLError('Season has no teams to predict against', {
                    extensions: { code: 'INVALID_PREDICTION_PAYLOAD', http: { status: 400 } },
                });
            }
            const seasonTeamIds = new Set(seasonTeams.map((t) => t.id));
            if (orderedTeamIds.length !== seasonTeamIds.size) {
                throw new GraphQLError(
                    `Expected ${seasonTeamIds.size} team ids, got ${orderedTeamIds.length}`,
                    {
                        extensions: {
                            code: 'INVALID_PREDICTION_PAYLOAD',
                            http: { status: 400 },
                        },
                    },
                );
            }
            const seen = new Set<string>();
            for (const teamId of orderedTeamIds) {
                if (!seasonTeamIds.has(teamId)) {
                    throw new GraphQLError(
                        `Team ${teamId} is not part of this season`,
                        {
                            extensions: {
                                code: 'INVALID_PREDICTION_PAYLOAD',
                                http: { status: 400 },
                            },
                        },
                    );
                }
                if (seen.has(teamId)) {
                    throw new GraphQLError(`Team ${teamId} appears more than once`, {
                        extensions: {
                            code: 'INVALID_PREDICTION_PAYLOAD',
                            http: { status: 400 },
                        },
                    });
                }
                seen.add(teamId);
            }

            // Cap: counts every row including soft-deleted ones. The whole
            // reason soft-delete exists is so this loop can't be bypassed by
            // create-then-delete spam.
            const [count, gameweekCount] = await Promise.all([
                repository.predictions.countSnapshotsInScope({
                    userId: ctx.user.id,
                    seasonId,
                    type: input.type as PredictionTypeValue,
                }),
                repository.predictions.countGameweeksInSeason(seasonId),
            ]);
            const limit = Math.max(SNAPSHOT_CAP_FLOOR, gameweekCount);
            if (count >= limit) {
                throw new GraphQLError(
                    `Prediction limit reached for this season (${count}/${limit})`,
                    {
                        extensions: {
                            code: 'PREDICTION_LIMIT_REACHED',
                            http: { status: 409 },
                            count,
                            limit,
                        },
                    },
                );
            }

            return repository.predictions.createSnapshot({
                userId: ctx.user.id,
                seasonId,
                type: input.type as PredictionTypeValue,
                entries: orderedTeamIds.map((teamId, idx) => ({
                    teamId,
                    position: idx + 1,
                })),
            });
        },
    }),
);

builder.mutationField('deletePredictionSnapshot', (t) =>
    t.id({
        description:
            "Soft-delete a snapshot (sets `deletedAt`). Idempotent on already-deleted rows. Owner or admin only. Returns the snapshot id.",
        args: { id: t.arg.id({ required: true }) },
        resolve: async (_root, { id }, ctx) => {
            if (!ctx.user) {
                throw new GraphQLError('Unauthenticated', {
                    extensions: { http: { status: 401 } },
                });
            }
            // Look up with `includeDeleted` so a re-issue against an already-
            // soft-deleted row stays idempotent rather than 404'ing.
            const snapshot = await repository.predictions.getSnapshotById({
                id: id as string,
                includeDeleted: true,
            });
            if (!snapshot) {
                throw new GraphQLError('Prediction snapshot not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'delete',
                    subject('Prediction', { userId: snapshot.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', {
                    extensions: { http: { status: 403 } },
                });
            }
            const deletedId = await repository.predictions.softDeleteSnapshot(snapshot.id);
            // softDeleteSnapshot returns null only when the row vanished
            // between the lookup and the update — extremely rare race;
            // surface the id we already have so the response stays stable.
            return deletedId ?? snapshot.id;
        },
    }),
);
