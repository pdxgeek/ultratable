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
export const MAX_TIER_LISTS_PER_USER_PER_SEASON = 30;
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

/**
 * Per-tier-list display preferences. Stored as JSONB on `tier_list` so new
 * toggles land here additively without a migration.
 *
 * - `showTeamNames` — render the team name label under each item.
 * - `showTeamLogos` — render the team crest as a corner badge on the item
 *   thumbnail.
 *
 * Both default `true` and gate independently so a user can keep the
 * badge while hiding the name (or vice versa).
 */
export interface TierListDisplayConfig {
    showTeamNames: boolean;
    showTeamLogos: boolean;
}

export const DEFAULT_DISPLAY_CONFIG: TierListDisplayConfig = {
    showTeamNames: true,
    showTeamLogos: true,
};

/**
 * Normalise a possibly-partial display config from storage or input to a
 * fully-populated record. Forward-compatible with new toggles — unknown
 * keys are dropped, missing keys fall back to the default.
 */
export function normaliseDisplayConfig(input: unknown): TierListDisplayConfig {
    if (!input || typeof input !== 'object') return { ...DEFAULT_DISPLAY_CONFIG };
    const obj = input as Record<string, unknown>;
    return {
        showTeamNames:
            typeof obj.showTeamNames === 'boolean'
                ? obj.showTeamNames
                : DEFAULT_DISPLAY_CONFIG.showTeamNames,
        showTeamLogos:
            typeof obj.showTeamLogos === 'boolean'
                ? obj.showTeamLogos
                : DEFAULT_DISPLAY_CONFIG.showTeamLogos,
    };
}
