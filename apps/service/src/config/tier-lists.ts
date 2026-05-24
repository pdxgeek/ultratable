/**
 * Tier-lists feature constants (umbrella issue #110).
 *
 * Caps and bounds are kept here as named exports so resolvers, migrations,
 * and tests reference the same source of truth. A future admin-config UI
 * will surface these without touching call sites.
 *
 * The caps deliberately count soft-deleted rows too — creating and deleting
 * in a loop must not bypass the limit. See `tier_list.deletedAt` /
 * `tier_rankable_item.deletedAt` and the matching `countTierListsInScope` /
 * `countItemsForTierList` repository methods.
 */
export const MAX_TIER_LISTS_PER_USER_PER_SEASON = 50;
export const MAX_ITEMS_PER_TIER_LIST = 100;
export const MIN_TIERS = 3;
export const MAX_TIERS = 7;
export const MAX_TITLE_LENGTH = 100;

/**
 * Default tier scheme applied to every newly-created tier list. Names are
 * editable; the `key` is a stable short id that items reference so
 * renaming "S" to "GOAT" does not touch items. Colors are picked by
 * tier index on the client (see umbrella issue #110 cross-cutting decisions)
 * and are not stored server-side in v1.
 */
export const DEFAULT_TIERS: ReadonlyArray<{ key: string; name: string }> = [
    { key: 'tier-s', name: 'S' },
    { key: 'tier-a', name: 'A' },
    { key: 'tier-b', name: 'B' },
    { key: 'tier-c', name: 'C' },
    { key: 'tier-d', name: 'D' },
    { key: 'tier-f', name: 'F' },
];
