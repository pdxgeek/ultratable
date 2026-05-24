/**
 * Tier-lists repository contract (umbrella #110, backend slice #112).
 *
 * Domain model (see [[../entities/tier-rankable-types/]] for the recipe
 * registry):
 *
 *   - **TierRankableType (registry)** — a small set of *recipe* rows in
 *     `tier_rankable_type` declaring which categories the product
 *     supports (`coach`, `player`, `venue`). Each row pairs with a TS
 *     resolver that projects source data onto the
 *     tier-rankable-item display contract (name / imageUrl / teamId)
 *     and derives a per-instance natural key.
 *   - **TierList** — a per-(user, season, recipe) ranking surface with a
 *     JSONB tier scheme.
 *   - **TierRankableItem** — a concrete slot in a tier list. Carries the
 *     recipe's projection snapshot (name, imageUrl, teamId, source
 *     pointer), the per-instance natural key, and per-user overrides.
 *     `(tier_rankable_type_id, natural_key)` is the cross-user identity
 *     for an instance and powers aggregates like "most-ranked Pep". No
 *     UNIQUE — two users CAN have the same coach in their lists.
 *
 * Soft delete is the law for the tier-list parent row and the item.
 * Deletes set `deletedAt`, rows stay. Caps count every row including
 * soft-deleted ones so a create/delete loop can't bypass the per-(user,
 * season) limit. Recipe rows are never deleted in normal operation.
 */

import type { TierListDisplayConfig } from '../config/tier-lists';

/** One row of the parent's tier scheme. Items reference `key`, not `name`. */
export interface Tier {
    key: string;
    name: string;
}

export interface TierRankableTypeRow {
    id: string;
    name: string;
    defaultFormulaId: string | null;
}

export interface TierListRow {
    id: string;
    userId: string;
    seasonId: string;
    /**
     * Which recipe this list ranks against. FK-validated against
     * `tier_rankable_type.id`.
     */
    tierRankableTypeId: string;
    title: string;
    tiers: Tier[];
    /**
     * Per-list display toggles (e.g. `showTeamNames`). Always present;
     * the repository normalises whatever shape was stored to the current
     * canonical shape before returning.
     */
    displayConfig: TierListDisplayConfig;
    /**
     * User-flipped read-only flag. When true, edit mutations throw
     * `TIER_LIST_LOCKED`. Never auto-set; the same user can flip it back.
     */
    isLocked: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

export interface TierRankableItemRow {
    id: string;
    tierListId: string;
    /** Which recipe produced this slot's snapshot. */
    tierRankableTypeId: string;
    /**
     * Recipe-derived stable id for this instance (e.g.
     * `<teamId>|pep guardiola` for the coach recipe).
     * `(tier_rankable_type_id, natural_key)` is the cross-user identity
     * for an instance.
     */
    naturalKey: string;
    /** null = item is in the pool, non-null = item is in that tier. */
    tierKey: string | null;
    position: number;
    /** Snapshot of recipe's projection at add time. */
    name: string;
    imageUrl: string | null;
    teamId: string | null;
    sourceType: string | null;
    sourceId: string | null;
    sourcePath: unknown | null;
    /** Per-user override; displayed name = nameOverride ?? name. */
    nameOverride: string | null;
    imageUrlOverride: string | null;
    subtitle: string | null;
    addedAt: Date;
    deletedAt: Date | null;
}

export interface CreateTierListInput {
    userId: string;
    seasonId: string;
    tierRankableTypeId: string;
    title: string;
    tiers: Tier[];
}

/**
 * The recipe's projection result, passed verbatim into `addTierRankableItem`.
 * The resolver computes this (or the editor's add-drawer pre-computes it
 * client-side from a source row), the repository persists it.
 */
export interface AddTierRankableItemInput {
    tierListId: string;
    tierRankableTypeId: string;
    naturalKey: string;
    name: string;
    imageUrl: string | null;
    teamId: string | null;
    sourceType: string | null;
    sourceId: string | null;
    sourcePath: unknown | null;
}

export interface UpdateTierRankableItemOverridesInput {
    itemId: string;
    /** Pass `null` to clear an override (fall back to the snapshot value). */
    nameOverride?: string | null;
    imageUrlOverride?: string | null;
    subtitle?: string | null;
}

export interface TierListsRepository {
    // -----------------------------------------------------------------
    // TierRankableType registry
    // -----------------------------------------------------------------

    /** Lookup a recipe row. Used to FK-validate `tier_list.tier_rankable_type_id`. */
    getTierRankableTypeById(id: string): Promise<TierRankableTypeRow | null>;

    /** All registered recipes — drives the create-tier-list category picker. */
    listTierRankableTypes(): Promise<TierRankableTypeRow[]>;

    // -----------------------------------------------------------------
    // Tier list (parent row)
    // -----------------------------------------------------------------

    createTierList(input: CreateTierListInput): Promise<TierListRow>;

    listTierLists(args: {
        userId: string;
        seasonId: string;
        tierRankableTypeId?: string;
        includeDeleted?: boolean;
    }): Promise<TierListRow[]>;

    getTierListById(args: {
        id: string;
        includeDeleted?: boolean;
    }): Promise<TierListRow | null>;

    updateTierListTitle(id: string, title: string): Promise<TierListRow | null>;

    /**
     * Replace the tier scheme atomically. Any items whose `tierKey` no
     * longer exists in the new scheme are rebased to `tierKey = null`
     * (back in the pool) in the same transaction.
     */
    updateTierListTiers(id: string, tiers: Tier[]): Promise<TierListRow | null>;

    /** Patch the display-config JSONB. Pass the full desired shape. */
    updateTierListDisplayConfig(
        id: string,
        displayConfig: TierListDisplayConfig,
    ): Promise<TierListRow | null>;

    /** Flip the user-controlled read-only flag. */
    setTierListLocked(id: string, isLocked: boolean): Promise<TierListRow | null>;

    /** Idempotent soft-delete. */
    softDeleteTierList(id: string): Promise<string | null>;

    countTierListsInScope(args: { userId: string; seasonId: string }): Promise<number>;

    // -----------------------------------------------------------------
    // Tier rankable items
    // -----------------------------------------------------------------

    /**
     * Add an item to the parent's pool row OR restore a previously-removed
     * one. When a live item with the same `(tierListId, naturalKey)` already
     * exists, returns it untouched (no duplicate). When a soft-deleted item
     * with that key exists, un-soft-deletes it: clears `deletedAt`, moves
     * it to the end of the pool (so re-added items land where you expect),
     * refreshes the snapshot fields from the new input (name / imageUrl /
     * teamId / source pointer — recipes can produce updated values, e.g. a
     * coach's photo changes), and preserves the per-user overrides
     * (`nameOverride` / `imageUrlOverride` / `subtitle`). Otherwise, inserts
     * a fresh item at the end of the pool with position = max + 1.0.
     *
     * Powers the "re-running a pool search restores previously-removed
     * matches" rule (umbrella #110, issue #113). Caller is responsible for
     * validating the cap and the recipe match.
     */
    addTierRankableItem(input: AddTierRankableItemInput): Promise<TierRankableItemRow>;

    updateTierRankableItemOverrides(
        input: UpdateTierRankableItemOverridesInput,
    ): Promise<TierRankableItemRow | null>;

    softDeleteTierRankableItem(itemId: string): Promise<string | null>;

    moveTierRankableItem(args: {
        itemId: string;
        tierKey: string | null;
        position: number;
    }): Promise<TierRankableItemRow | null>;

    listItemsForTierList(tierListId: string): Promise<TierRankableItemRow[]>;

    /**
     * Batched variant for DataLoader. Returns one item list per requested
     * tier list id (live items only), in the same order.
     */
    listItemsByTierListIds(
        tierListIds: readonly string[],
    ): Promise<Map<string, TierRankableItemRow[]>>;

    getTierRankableItemById(args: {
        itemId: string;
        includeDeleted?: boolean;
    }): Promise<TierRankableItemRow | null>;

    countItemsForTierList(tierListId: string): Promise<number>;
}
