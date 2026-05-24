import {
    and,
    asc,
    count,
    desc,
    eq,
    inArray,
    isNotNull,
    isNull,
    max,
    notInArray,
} from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import type {
    AddTierRankableItemInput,
    CreateTierListInput,
    Tier,
    TierListRow,
    TierListsRepository,
    TierRankableItemRow,
    TierRankableTypeRow,
    UpdateTierRankableItemOverridesInput,
} from '../tier-lists';
import { NOW_MS } from './shared';

function mapType(row: typeof schema.tierRankableTypes.$inferSelect): TierRankableTypeRow {
    return { id: row.id, name: row.name, defaultFormulaId: row.defaultFormulaId };
}

function mapTierList(row: typeof schema.tierLists.$inferSelect): TierListRow {
    return {
        id: row.id,
        userId: row.userId,
        seasonId: row.seasonId,
        tierRankableTypeId: row.tierRankableTypeId,
        title: row.title,
        tiers: row.tiers as Tier[],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
    };
}

function mapItem(row: typeof schema.tierRankableItems.$inferSelect): TierRankableItemRow {
    return {
        id: row.id,
        tierListId: row.tierListId,
        tierRankableTypeId: row.tierRankableTypeId,
        naturalKey: row.naturalKey,
        tierKey: row.tierKey,
        position: row.position,
        name: row.name,
        imageUrl: row.imageUrl,
        teamId: row.teamId,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourcePath: row.sourcePath,
        nameOverride: row.nameOverride,
        imageUrlOverride: row.imageUrlOverride,
        subtitle: row.subtitle,
        addedAt: row.addedAt,
        deletedAt: row.deletedAt,
    };
}

export class PostgresTierListsRepository implements TierListsRepository {
    // ------------------------------------------------------------------
    // TierRankableType registry
    // ------------------------------------------------------------------

    async getTierRankableTypeById(id: string): Promise<TierRankableTypeRow | null> {
        if (!db) return null;
        const [row] = await db
            .select()
            .from(schema.tierRankableTypes)
            .where(eq(schema.tierRankableTypes.id, id))
            .limit(1);
        return row ? mapType(row) : null;
    }

    async listTierRankableTypes(): Promise<TierRankableTypeRow[]> {
        if (!db) return [];
        const rows = await db
            .select()
            .from(schema.tierRankableTypes)
            .orderBy(asc(schema.tierRankableTypes.id));
        return rows.map(mapType);
    }

    // ------------------------------------------------------------------
    // Tier list (parent)
    // ------------------------------------------------------------------

    async createTierList(input: CreateTierListInput): Promise<TierListRow> {
        if (!db) throw new Error('Database not configured');
        const [row] = await db
            .insert(schema.tierLists)
            .values({
                userId: input.userId,
                seasonId: input.seasonId,
                tierRankableTypeId: input.tierRankableTypeId,
                title: input.title,
                tiers: input.tiers,
            })
            .returning();
        if (!row) throw new Error('Failed to insert tier list');
        return mapTierList(row);
    }

    async listTierLists(args: {
        userId: string;
        seasonId: string;
        tierRankableTypeId?: string;
        includeDeleted?: boolean;
    }): Promise<TierListRow[]> {
        if (!db) return [];
        const conditions = [
            eq(schema.tierLists.userId, args.userId),
            eq(schema.tierLists.seasonId, args.seasonId),
        ];
        if (args.tierRankableTypeId !== undefined) {
            conditions.push(eq(schema.tierLists.tierRankableTypeId, args.tierRankableTypeId));
        }
        if (!args.includeDeleted) {
            conditions.push(isNull(schema.tierLists.deletedAt));
        }
        const rows = await db
            .select()
            .from(schema.tierLists)
            .where(and(...conditions))
            .orderBy(desc(schema.tierLists.createdAt));
        return rows.map(mapTierList);
    }

    async getTierListById(args: {
        id: string;
        includeDeleted?: boolean;
    }): Promise<TierListRow | null> {
        if (!db) return null;
        const conditions = [eq(schema.tierLists.id, args.id)];
        if (!args.includeDeleted) {
            conditions.push(isNull(schema.tierLists.deletedAt));
        }
        const [row] = await db
            .select()
            .from(schema.tierLists)
            .where(and(...conditions))
            .limit(1);
        return row ? mapTierList(row) : null;
    }

    async updateTierListTitle(id: string, title: string): Promise<TierListRow | null> {
        if (!db) return null;
        const [row] = await db
            .update(schema.tierLists)
            .set({ title, updatedAt: NOW_MS as unknown as Date })
            .where(and(eq(schema.tierLists.id, id), isNull(schema.tierLists.deletedAt)))
            .returning();
        return row ? mapTierList(row) : null;
    }

    async updateTierListTiers(id: string, tiers: Tier[]): Promise<TierListRow | null> {
        if (!db) return null;
        return await db.transaction(async (tx) => {
            const [updated] = await tx
                .update(schema.tierLists)
                .set({ tiers, updatedAt: NOW_MS as unknown as Date })
                .where(and(eq(schema.tierLists.id, id), isNull(schema.tierLists.deletedAt)))
                .returning();
            if (!updated) return null;

            const validKeys = tiers.map((t) => t.key);
            const orphanFilter =
                validKeys.length === 0
                    ? isNotNull(schema.tierRankableItems.tierKey)
                    : and(
                          isNotNull(schema.tierRankableItems.tierKey),
                          notInArray(schema.tierRankableItems.tierKey, validKeys),
                      );
            await tx
                .update(schema.tierRankableItems)
                .set({ tierKey: null })
                .where(
                    and(
                        eq(schema.tierRankableItems.tierListId, id),
                        isNull(schema.tierRankableItems.deletedAt),
                        orphanFilter,
                    ),
                );

            return mapTierList(updated);
        });
    }

    async softDeleteTierList(id: string): Promise<string | null> {
        if (!db) return null;
        const [live] = await db
            .update(schema.tierLists)
            .set({ deletedAt: NOW_MS as unknown as Date })
            .where(and(eq(schema.tierLists.id, id), isNull(schema.tierLists.deletedAt)))
            .returning({ id: schema.tierLists.id });
        if (live) return live.id;

        const [existing] = await db
            .select({ id: schema.tierLists.id })
            .from(schema.tierLists)
            .where(and(eq(schema.tierLists.id, id), isNotNull(schema.tierLists.deletedAt)))
            .limit(1);
        return existing?.id ?? null;
    }

    async countTierListsInScope(args: {
        userId: string;
        seasonId: string;
    }): Promise<number> {
        if (!db) return 0;
        const [res] = await db
            .select({ val: count() })
            .from(schema.tierLists)
            .where(
                and(
                    eq(schema.tierLists.userId, args.userId),
                    eq(schema.tierLists.seasonId, args.seasonId),
                ),
            );
        return Number(res?.val ?? 0);
    }

    // ------------------------------------------------------------------
    // Tier rankable items
    // ------------------------------------------------------------------

    async addTierRankableItem(input: AddTierRankableItemInput): Promise<TierRankableItemRow> {
        if (!db) throw new Error('Database not configured');
        const [tail] = await db
            .select({ maxPos: max(schema.tierRankableItems.position) })
            .from(schema.tierRankableItems)
            .where(
                and(
                    eq(schema.tierRankableItems.tierListId, input.tierListId),
                    isNull(schema.tierRankableItems.deletedAt),
                    isNull(schema.tierRankableItems.tierKey),
                ),
            );
        const nextPosition = (tail?.maxPos ?? 0) + 1.0;

        const [row] = await db
            .insert(schema.tierRankableItems)
            .values({
                tierListId: input.tierListId,
                tierRankableTypeId: input.tierRankableTypeId,
                naturalKey: input.naturalKey,
                tierKey: null,
                position: nextPosition,
                name: input.name,
                imageUrl: input.imageUrl,
                teamId: input.teamId,
                sourceType: input.sourceType,
                sourceId: input.sourceId,
                sourcePath: input.sourcePath,
            })
            .returning();
        if (!row) throw new Error('Failed to insert tier rankable item');
        return mapItem(row);
    }

    async updateTierRankableItemOverrides(
        input: UpdateTierRankableItemOverridesInput,
    ): Promise<TierRankableItemRow | null> {
        if (!db) return null;
        const patch: Partial<typeof schema.tierRankableItems.$inferInsert> = {};
        if (input.nameOverride !== undefined) patch.nameOverride = input.nameOverride;
        if (input.imageUrlOverride !== undefined) patch.imageUrlOverride = input.imageUrlOverride;
        if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
        if (Object.keys(patch).length === 0) {
            return this.getTierRankableItemById({ itemId: input.itemId });
        }
        const [row] = await db
            .update(schema.tierRankableItems)
            .set(patch)
            .where(
                and(
                    eq(schema.tierRankableItems.id, input.itemId),
                    isNull(schema.tierRankableItems.deletedAt),
                ),
            )
            .returning();
        return row ? mapItem(row) : null;
    }

    async softDeleteTierRankableItem(itemId: string): Promise<string | null> {
        if (!db) return null;
        const [live] = await db
            .update(schema.tierRankableItems)
            .set({ deletedAt: NOW_MS as unknown as Date })
            .where(
                and(
                    eq(schema.tierRankableItems.id, itemId),
                    isNull(schema.tierRankableItems.deletedAt),
                ),
            )
            .returning({ id: schema.tierRankableItems.id });
        if (live) return live.id;

        const [existing] = await db
            .select({ id: schema.tierRankableItems.id })
            .from(schema.tierRankableItems)
            .where(
                and(
                    eq(schema.tierRankableItems.id, itemId),
                    isNotNull(schema.tierRankableItems.deletedAt),
                ),
            )
            .limit(1);
        return existing?.id ?? null;
    }

    async moveTierRankableItem(args: {
        itemId: string;
        tierKey: string | null;
        position: number;
    }): Promise<TierRankableItemRow | null> {
        if (!db) return null;
        const [row] = await db
            .update(schema.tierRankableItems)
            .set({ tierKey: args.tierKey, position: args.position })
            .where(
                and(
                    eq(schema.tierRankableItems.id, args.itemId),
                    isNull(schema.tierRankableItems.deletedAt),
                ),
            )
            .returning();
        return row ? mapItem(row) : null;
    }

    async listItemsForTierList(tierListId: string): Promise<TierRankableItemRow[]> {
        if (!db) return [];
        const rows = await db
            .select()
            .from(schema.tierRankableItems)
            .where(
                and(
                    eq(schema.tierRankableItems.tierListId, tierListId),
                    isNull(schema.tierRankableItems.deletedAt),
                ),
            )
            .orderBy(asc(schema.tierRankableItems.tierKey), asc(schema.tierRankableItems.position));
        return rows.map(mapItem);
    }

    async listItemsByTierListIds(
        tierListIds: readonly string[],
    ): Promise<Map<string, TierRankableItemRow[]>> {
        const result = new Map<string, TierRankableItemRow[]>();
        for (const id of tierListIds) result.set(id, []);
        if (!db || tierListIds.length === 0) return result;
        const rows = await db
            .select()
            .from(schema.tierRankableItems)
            .where(
                and(
                    inArray(schema.tierRankableItems.tierListId, [...tierListIds]),
                    isNull(schema.tierRankableItems.deletedAt),
                ),
            )
            .orderBy(asc(schema.tierRankableItems.tierKey), asc(schema.tierRankableItems.position));
        for (const r of rows) {
            const bucket = result.get(r.tierListId);
            if (bucket) bucket.push(mapItem(r));
        }
        return result;
    }

    async getTierRankableItemById(args: {
        itemId: string;
        includeDeleted?: boolean;
    }): Promise<TierRankableItemRow | null> {
        if (!db) return null;
        const conditions = [eq(schema.tierRankableItems.id, args.itemId)];
        if (!args.includeDeleted) {
            conditions.push(isNull(schema.tierRankableItems.deletedAt));
        }
        const [row] = await db
            .select()
            .from(schema.tierRankableItems)
            .where(and(...conditions))
            .limit(1);
        return row ? mapItem(row) : null;
    }

    async countItemsForTierList(tierListId: string): Promise<number> {
        if (!db) return 0;
        const [res] = await db
            .select({ val: count() })
            .from(schema.tierRankableItems)
            .where(eq(schema.tierRankableItems.tierListId, tierListId));
        return Number(res?.val ?? 0);
    }
}
