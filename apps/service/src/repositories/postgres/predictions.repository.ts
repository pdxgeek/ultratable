import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import {
    CreatePredictionSnapshotInput,
    PredictionSnapshotEntryRow,
    PredictionSnapshotRow,
    PredictionType,
    PredictionsRepository,
} from '../predictions';
import { NOW_MS } from './shared';

function mapSnapshot(row: typeof schema.predictionSnapshots.$inferSelect): PredictionSnapshotRow {
    return {
        id: row.id,
        userId: row.userId,
        seasonId: row.seasonId,
        type: row.type as PredictionType,
        lockedAt: row.lockedAt,
        deletedAt: row.deletedAt,
    };
}

export class PostgresPredictionsRepository implements PredictionsRepository {
    async createSnapshot(input: CreatePredictionSnapshotInput): Promise<PredictionSnapshotRow> {
        if (!db) throw new Error('Database not configured');
        return await db.transaction(async (tx) => {
            const [snapshot] = await tx
                .insert(schema.predictionSnapshots)
                .values({
                    userId: input.userId,
                    seasonId: input.seasonId,
                    type: input.type,
                })
                .returning();
            if (!snapshot) throw new Error('Failed to insert prediction snapshot');

            if (input.entries.length > 0) {
                await tx.insert(schema.predictionSnapshotEntries).values(
                    input.entries.map((e) => ({
                        snapshotId: snapshot.id,
                        teamId: e.teamId,
                        position: e.position,
                    })),
                );
            }

            return mapSnapshot(snapshot);
        });
    }

    async listSnapshots(args: {
        userId: string;
        seasonId: string;
        type: PredictionType;
        includeDeleted?: boolean;
    }): Promise<PredictionSnapshotRow[]> {
        if (!db) return [];
        const conditions = [
            eq(schema.predictionSnapshots.userId, args.userId),
            eq(schema.predictionSnapshots.seasonId, args.seasonId),
            eq(schema.predictionSnapshots.type, args.type),
        ];
        if (!args.includeDeleted) {
            conditions.push(isNull(schema.predictionSnapshots.deletedAt));
        }
        const rows = await db
            .select()
            .from(schema.predictionSnapshots)
            .where(and(...conditions))
            .orderBy(desc(schema.predictionSnapshots.lockedAt));
        return rows.map(mapSnapshot);
    }

    async getSnapshotById(args: {
        id: string;
        includeDeleted?: boolean;
    }): Promise<PredictionSnapshotRow | null> {
        if (!db) return null;
        const conditions = [eq(schema.predictionSnapshots.id, args.id)];
        if (!args.includeDeleted) {
            conditions.push(isNull(schema.predictionSnapshots.deletedAt));
        }
        const [row] = await db
            .select()
            .from(schema.predictionSnapshots)
            .where(and(...conditions))
            .limit(1);
        return row ? mapSnapshot(row) : null;
    }

    async listSnapshotEntries(snapshotId: string): Promise<PredictionSnapshotEntryRow[]> {
        if (!db) return [];
        const rows = await db
            .select({
                teamId: schema.predictionSnapshotEntries.teamId,
                position: schema.predictionSnapshotEntries.position,
            })
            .from(schema.predictionSnapshotEntries)
            .where(eq(schema.predictionSnapshotEntries.snapshotId, snapshotId))
            .orderBy(asc(schema.predictionSnapshotEntries.position));
        return rows;
    }

    async listSnapshotEntriesByIds(
        snapshotIds: readonly string[],
    ): Promise<Map<string, PredictionSnapshotEntryRow[]>> {
        const result = new Map<string, PredictionSnapshotEntryRow[]>();
        for (const id of snapshotIds) result.set(id, []);
        if (!db || snapshotIds.length === 0) return result;
        const rows = await db
            .select({
                snapshotId: schema.predictionSnapshotEntries.snapshotId,
                teamId: schema.predictionSnapshotEntries.teamId,
                position: schema.predictionSnapshotEntries.position,
            })
            .from(schema.predictionSnapshotEntries)
            .where(inArray(schema.predictionSnapshotEntries.snapshotId, [...snapshotIds]))
            .orderBy(asc(schema.predictionSnapshotEntries.position));
        for (const r of rows) {
            const bucket = result.get(r.snapshotId);
            if (bucket) bucket.push({ teamId: r.teamId, position: r.position });
        }
        return result;
    }

    async softDeleteSnapshot(id: string): Promise<string | null> {
        if (!db) return null;
        // Two-statement path: the UPDATE only matches live rows so we can
        // tell "didn't exist" (null) from "already deleted" (returns id).
        const [live] = await db
            .update(schema.predictionSnapshots)
            .set({ deletedAt: NOW_MS as unknown as Date })
            .where(
                and(
                    eq(schema.predictionSnapshots.id, id),
                    isNull(schema.predictionSnapshots.deletedAt),
                ),
            )
            .returning({ id: schema.predictionSnapshots.id });
        if (live) return live.id;

        const [existing] = await db
            .select({ id: schema.predictionSnapshots.id })
            .from(schema.predictionSnapshots)
            .where(
                and(
                    eq(schema.predictionSnapshots.id, id),
                    isNotNull(schema.predictionSnapshots.deletedAt),
                ),
            )
            .limit(1);
        return existing?.id ?? null;
    }

    async countSnapshotsInScope(args: {
        userId: string;
        seasonId: string;
        type: PredictionType;
    }): Promise<number> {
        if (!db) return 0;
        const [res] = await db
            .select({ val: count() })
            .from(schema.predictionSnapshots)
            .where(
                and(
                    eq(schema.predictionSnapshots.userId, args.userId),
                    eq(schema.predictionSnapshots.seasonId, args.seasonId),
                    eq(schema.predictionSnapshots.type, args.type),
                ),
            );
        return Number(res?.val ?? 0);
    }

    async countGameweeksInSeason(seasonId: string): Promise<number> {
        if (!db) return 0;
        const [res] = await db
            .select({ val: countDistinct(schema.fixtures.gameweek) })
            .from(schema.fixtures)
            .where(
                and(
                    eq(schema.fixtures.seasonId, seasonId),
                    isNotNull(schema.fixtures.gameweek),
                ),
            );
        return Number(res?.val ?? 0);
    }
}
