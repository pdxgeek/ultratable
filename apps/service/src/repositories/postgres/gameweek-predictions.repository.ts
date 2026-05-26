import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import {
    GameweekPredictionPickRow,
    GameweekPredictionRow,
    GameweekPredictionsRepository,
    SubmitGameweekPickInput,
    SubmitGameweekPickResult,
} from '../gameweek-predictions';
import { NOW_MS } from './shared';

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: unknown }).code === UNIQUE_VIOLATION
    );
}

function mapPrediction(
    row: typeof schema.gameweekPredictions.$inferSelect,
): GameweekPredictionRow {
    return {
        id: row.id,
        userId: row.userId,
        seasonId: row.seasonId,
        gameweek: row.gameweek,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
    };
}

function mapPick(
    row: typeof schema.gameweekPredictionPicks.$inferSelect,
): GameweekPredictionPickRow {
    return {
        id: row.id,
        predictionId: row.predictionId,
        fixtureId: row.fixtureId,
        homeGoals: row.homeGoals,
        awayGoals: row.awayGoals,
        note: row.note,
        manuallyAdded: row.manuallyAdded,
        createdAt: row.createdAt,
    };
}

/**
 * True when `latest` and `incoming` represent the same pick — used by
 * `submitPick` to skip a no-op re-commit and keep the chain clean.
 * Treats null as a distinct value (null === null is identical, null ≠ 0).
 */
function isIdenticalPick(
    latest: GameweekPredictionPickRow,
    incoming: SubmitGameweekPickInput,
): boolean {
    return (
        latest.homeGoals === incoming.homeGoals &&
        latest.awayGoals === incoming.awayGoals &&
        (latest.note ?? null) === (incoming.note ?? null) &&
        latest.manuallyAdded === incoming.manuallyAdded
    );
}

export class PostgresGameweekPredictionsRepository implements GameweekPredictionsRepository {
    async submitPick(input: SubmitGameweekPickInput): Promise<SubmitGameweekPickResult> {
        if (!db) throw new Error('Database not configured');

        return await db.transaction(async (tx) => {
            // 1. Find-or-create the container. Two roundtrips in the cold path
            // (SELECT, then INSERT) so we never INSERT speculatively. On the
            // racey path two concurrent first-submits both miss the SELECT
            // and only one INSERT wins under the partial unique — the other
            // re-SELECTs and joins the winner.
            const existingContainer = await tx
                .select()
                .from(schema.gameweekPredictions)
                .where(
                    and(
                        eq(schema.gameweekPredictions.userId, input.userId),
                        eq(schema.gameweekPredictions.seasonId, input.seasonId),
                        eq(schema.gameweekPredictions.gameweek, input.gameweek),
                        isNull(schema.gameweekPredictions.deletedAt),
                    ),
                )
                .limit(1);

            let container: typeof schema.gameweekPredictions.$inferSelect;
            if (existingContainer[0]) {
                container = existingContainer[0];
            } else {
                try {
                    const [created] = await tx
                        .insert(schema.gameweekPredictions)
                        .values({
                            userId: input.userId,
                            seasonId: input.seasonId,
                            gameweek: input.gameweek,
                        })
                        .returning();
                    if (!created) throw new Error('Failed to insert gameweek prediction');
                    container = created;
                } catch (err) {
                    if (!isUniqueViolation(err)) throw err;
                    // Concurrent INSERT won — re-SELECT and use that row.
                    const [retry] = await tx
                        .select()
                        .from(schema.gameweekPredictions)
                        .where(
                            and(
                                eq(schema.gameweekPredictions.userId, input.userId),
                                eq(schema.gameweekPredictions.seasonId, input.seasonId),
                                eq(schema.gameweekPredictions.gameweek, input.gameweek),
                                isNull(schema.gameweekPredictions.deletedAt),
                            ),
                        )
                        .limit(1);
                    if (!retry) throw err;
                    container = retry;
                }
            }

            // 2. Dedup against the latest pick for this fixture.
            const [latestRow] = await tx
                .select()
                .from(schema.gameweekPredictionPicks)
                .where(
                    and(
                        eq(schema.gameweekPredictionPicks.predictionId, container.id),
                        eq(schema.gameweekPredictionPicks.fixtureId, input.fixtureId),
                    ),
                )
                .orderBy(desc(schema.gameweekPredictionPicks.createdAt))
                .limit(1);

            if (latestRow) {
                const latest = mapPick(latestRow);
                if (isIdenticalPick(latest, input)) {
                    return {
                        prediction: mapPrediction(container),
                        pick: latest,
                        deduped: true,
                    };
                }
            }

            // 3. Insert the new pick and bump the container's updatedAt in the
            // same transaction so history-panel sort stays consistent with
            // pick visibility.
            const [pick] = await tx
                .insert(schema.gameweekPredictionPicks)
                .values({
                    predictionId: container.id,
                    fixtureId: input.fixtureId,
                    homeGoals: input.homeGoals,
                    awayGoals: input.awayGoals,
                    note: input.note,
                    manuallyAdded: input.manuallyAdded,
                })
                .returning();
            if (!pick) throw new Error('Failed to insert gameweek prediction pick');

            const [bumped] = await tx
                .update(schema.gameweekPredictions)
                .set({ updatedAt: NOW_MS as unknown as Date })
                .where(eq(schema.gameweekPredictions.id, container.id))
                .returning();

            return {
                prediction: mapPrediction(bumped ?? container),
                pick: mapPick(pick),
                deduped: false,
            };
        });
    }

    async listPredictionsForUser(args: {
        userId: string;
        seasonId: string;
        includeDeleted?: boolean;
    }): Promise<GameweekPredictionRow[]> {
        if (!db) return [];
        const conditions = [
            eq(schema.gameweekPredictions.userId, args.userId),
            eq(schema.gameweekPredictions.seasonId, args.seasonId),
        ];
        if (!args.includeDeleted) {
            conditions.push(isNull(schema.gameweekPredictions.deletedAt));
        }
        const rows = await db
            .select()
            .from(schema.gameweekPredictions)
            .where(and(...conditions))
            .orderBy(desc(schema.gameweekPredictions.updatedAt));
        return rows.map(mapPrediction);
    }

    async getPredictionForWeek(args: {
        userId: string;
        seasonId: string;
        gameweek: number;
    }): Promise<GameweekPredictionRow | null> {
        if (!db) return null;
        const [row] = await db
            .select()
            .from(schema.gameweekPredictions)
            .where(
                and(
                    eq(schema.gameweekPredictions.userId, args.userId),
                    eq(schema.gameweekPredictions.seasonId, args.seasonId),
                    eq(schema.gameweekPredictions.gameweek, args.gameweek),
                    isNull(schema.gameweekPredictions.deletedAt),
                ),
            )
            .limit(1);
        return row ? mapPrediction(row) : null;
    }

    async getPredictionById(args: {
        id: string;
        includeDeleted?: boolean;
    }): Promise<GameweekPredictionRow | null> {
        if (!db) return null;
        const conditions = [eq(schema.gameweekPredictions.id, args.id)];
        if (!args.includeDeleted) {
            conditions.push(isNull(schema.gameweekPredictions.deletedAt));
        }
        const [row] = await db
            .select()
            .from(schema.gameweekPredictions)
            .where(and(...conditions))
            .limit(1);
        return row ? mapPrediction(row) : null;
    }

    async softDeletePrediction(id: string): Promise<string | null> {
        if (!db) return null;
        // Two-statement path mirroring `softDeleteSnapshot` (#105): the UPDATE
        // only matches live rows so we can tell "didn't exist" (null) from
        // "already deleted" (returns id).
        const [live] = await db
            .update(schema.gameweekPredictions)
            .set({ deletedAt: NOW_MS as unknown as Date })
            .where(
                and(
                    eq(schema.gameweekPredictions.id, id),
                    isNull(schema.gameweekPredictions.deletedAt),
                ),
            )
            .returning({ id: schema.gameweekPredictions.id });
        if (live) return live.id;

        const [existing] = await db
            .select({ id: schema.gameweekPredictions.id })
            .from(schema.gameweekPredictions)
            .where(
                and(
                    eq(schema.gameweekPredictions.id, id),
                    isNotNull(schema.gameweekPredictions.deletedAt),
                ),
            )
            .limit(1);
        return existing?.id ?? null;
    }

    async listCurrentPicks(predictionId: string): Promise<GameweekPredictionPickRow[]> {
        if (!db) return [];
        // DISTINCT ON (fixture_id) keeps only the row with the largest
        // created_at per fixture. Postgres-specific but the natural fit
        // for a per-fixture-latest read.
        const rows = await db.execute<typeof schema.gameweekPredictionPicks.$inferSelect>(
            sql`
                SELECT DISTINCT ON (fixture_id)
                    id,
                    prediction_id AS "predictionId",
                    fixture_id AS "fixtureId",
                    home_goals AS "homeGoals",
                    away_goals AS "awayGoals",
                    note,
                    manually_added AS "manuallyAdded",
                    created_at AS "createdAt"
                FROM ${schema.gameweekPredictionPicks}
                WHERE prediction_id = ${predictionId}
                ORDER BY fixture_id, created_at DESC
            `,
        );
        return rows.map((row) => mapPick(row));
    }

    async listPickHistory(predictionId: string): Promise<GameweekPredictionPickRow[]> {
        if (!db) return [];
        const rows = await db
            .select()
            .from(schema.gameweekPredictionPicks)
            .where(eq(schema.gameweekPredictionPicks.predictionId, predictionId))
            .orderBy(desc(schema.gameweekPredictionPicks.createdAt));
        return rows.map(mapPick);
    }

    async listCurrentPicksByPredictionIds(
        predictionIds: readonly string[],
    ): Promise<Map<string, GameweekPredictionPickRow[]>> {
        const result = new Map<string, GameweekPredictionPickRow[]>();
        for (const id of predictionIds) result.set(id, []);
        if (!db || predictionIds.length === 0) return result;

        // Window-function variant of the DISTINCT ON in `listCurrentPicks` —
        // partitions by (prediction_id, fixture_id) so one batched query
        // hydrates every requested slip's current picks.
        const rows = await db.execute<typeof schema.gameweekPredictionPicks.$inferSelect>(
            sql`
                SELECT
                    id,
                    prediction_id AS "predictionId",
                    fixture_id AS "fixtureId",
                    home_goals AS "homeGoals",
                    away_goals AS "awayGoals",
                    note,
                    manually_added AS "manuallyAdded",
                    created_at AS "createdAt"
                FROM (
                    SELECT *,
                        ROW_NUMBER() OVER (
                            PARTITION BY prediction_id, fixture_id
                            ORDER BY created_at DESC
                        ) AS rn
                    FROM ${schema.gameweekPredictionPicks}
                    WHERE prediction_id IN ${predictionIds}
                ) latest
                WHERE rn = 1
            `,
        );
        for (const row of rows) {
            const bucket = result.get(row.predictionId);
            if (bucket) bucket.push(mapPick(row));
        }
        return result;
    }

    async listPickHistoryByPredictionIds(
        predictionIds: readonly string[],
    ): Promise<Map<string, GameweekPredictionPickRow[]>> {
        const result = new Map<string, GameweekPredictionPickRow[]>();
        for (const id of predictionIds) result.set(id, []);
        if (!db || predictionIds.length === 0) return result;

        const rows = await db
            .select()
            .from(schema.gameweekPredictionPicks)
            .where(inArray(schema.gameweekPredictionPicks.predictionId, [...predictionIds]))
            .orderBy(desc(schema.gameweekPredictionPicks.createdAt));
        for (const row of rows) {
            const bucket = result.get(row.predictionId);
            if (bucket) bucket.push(mapPick(row));
        }
        return result;
    }
}
