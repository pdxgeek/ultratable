/**
 * Tier-lists GraphQL surface (umbrella #110, backend slice #112).
 *
 * Domain model:
 *   - `TierRankableType` is a *recipe* — a small registry of categories
 *     the product can rank (`coach`, `player`, `venue`). Each row pairs
 *     with a server-side recipe resolver (see
 *     [[../entities/tier-rankable-types/]]) that projects source data
 *     onto the tier-rankable-item display contract. v1 ships the
 *     `coach` recipe.
 *   - `TierList` is bound to one recipe via `tierRankableTypeId`. Its
 *     items can only be projected by that recipe.
 *   - `TierRankableItem` carries the recipe's projection snapshot plus
 *     per-user overrides. `(tierRankableTypeId, naturalKey)` is the
 *     cross-user identity for an instance.
 *
 * Authorization goes through CASL only — see [[../auth/abilities.ts]].
 * Item mutations gate on the parent tier-list ability. Recipe rows are
 * app-wide read-only data — any authenticated viewer can query them.
 */
import { subject } from '@casl/ability';
import { GraphQLError } from 'graphql';

import {
    DEFAULT_TIERS,
    MAX_ITEMS_PER_TIER_LIST,
    MAX_TIER_LISTS_PER_USER_PER_SEASON,
    MAX_TIERS,
    MAX_TITLE_LENGTH,
    MIN_TIERS,
    normaliseDisplayConfig,
} from '../config/tier-lists';
import { coachRecipe } from '../entities/tier-rankable-types/coach';
import type { TierRankableTypeProjection } from '../entities/tier-rankable-types/recipe';
import { venueRecipe } from '../entities/tier-rankable-types/venue';
import { repository } from '../repositories';
import type {
    Tier,
    TierListRow,
    TierRankableItemRow,
    TierRankableTypeRow,
} from '../repositories/tier-lists';
import { cacheService, TTL } from '../services/cache.service';
import { abilityOf, builder } from './builder';
import { TeamRef } from './football';

// ----------------------------------------------------------------------
// Object refs
// ----------------------------------------------------------------------

const TierRef = builder.simpleObject('Tier', {
    description:
        'One row of a tier list\'s tier scheme. Items reference `key`, not `name`, so renaming "S" to "GOAT" does not touch them.',
    fields: (t) => ({
        key: t.string({ description: 'Stable short id for this tier within its parent.' }),
        name: t.string({ description: 'Display label.' }),
    }),
});

const TierListDisplayConfigRef = builder.simpleObject('TierListDisplayConfig', {
    description:
        "Per-tier-list display preferences. New toggles land here additively — the underlying storage is JSONB so a future toggle doesn't need a migration.",
    fields: (t) => ({
        showTeamNames: t.boolean({
            description:
                "When true, the editor renders the team name label under each item thumbnail.",
        }),
        showTeamLogos: t.boolean({
            description:
                "When true, the editor renders the team crest as a corner badge on the item thumbnail.",
        }),
    }),
});

const TierListDisplayConfigInput = builder.inputType('TierListDisplayConfigInput', {
    description:
        "Patch for `updateTierListDisplayConfig`. Pass the full desired shape — server normalises and persists.",
    fields: (t) => ({
        showTeamNames: t.boolean({ required: true }),
        showTeamLogos: t.boolean({ required: true }),
    }),
});

/**
 * One candidate the pool add drawer can show, ready to feed back into
 * `addTierRankableItem`. The shape mirrors `AddTierRankableItemInput`
 * (sans `tierListId`) plus a couple of display extras (`subtitle`,
 * `team`) so the drawer can render an informative row without a second
 * round-trip. Returned by `tierRankableItemCandidates`.
 */
interface CandidateShape {
    tierRankableTypeId: string;
    naturalKey: string;
    name: string;
    imageUrl: string | null;
    teamId: string | null;
    sourceType: string | null;
    sourceId: string | null;
    sourcePath: unknown | null;
    subtitle: string | null;
}

const TierRankableItemCandidateRef =
    builder.objectRef<CandidateShape>('TierRankableItemCandidate');

builder.objectType(TierRankableItemCandidateRef, {
    description:
        "One candidate the pool add drawer can offer. The shape mirrors `AddTierRankableItemInput` minus `tierListId` — submit it via `addTierRankableItem` to add. Re-adding a previously-removed item with the same `(tierRankableTypeId, naturalKey)` restores it server-side rather than duplicating.",
    fields: (t) => ({
        tierRankableTypeId: t.exposeString('tierRankableTypeId'),
        naturalKey: t.exposeString('naturalKey'),
        name: t.exposeString('name'),
        imageUrl: t.exposeString('imageUrl', { nullable: true }),
        teamId: t.exposeID('teamId', { nullable: true }),
        sourceType: t.exposeString('sourceType', { nullable: true }),
        sourceId: t.exposeID('sourceId', { nullable: true }),
        sourcePath: t.field({
            type: 'JSON',
            nullable: true,
            resolve: (parent) => parent.sourcePath,
        }),
        subtitle: t.exposeString('subtitle', {
            nullable: true,
            description: 'Optional secondary line (e.g. venue city + capacity).',
        }),
        team: t.field({
            type: TeamRef,
            nullable: true,
            description: 'Team this candidate is associated with. Resolved from `teamId` via DataLoader.',
            resolve: (parent, _args, ctx) =>
                parent.teamId ? ctx.loaders.teamLoader.load(parent.teamId) : null,
        }),
    }),
});

const TierRankableTypeRef = builder.objectRef<TierRankableTypeRow>('TierRankableType');
const TierListRef = builder.objectRef<TierListRow>('TierList');
const TierRankableItemRef = builder.objectRef<TierRankableItemRow>('TierRankableItem');

builder.objectType(TierRankableTypeRef, {
    description:
        "A *recipe* — declares that a ranking category exists (e.g. `coach`, `player`, `venue`) and pairs with a server-side resolver that projects source data into tier-rankable items. Not a per-instance row; the registry is small (~3 rows in v1).",
    fields: (t) => ({
        id: t.exposeID('id', {
            description: 'Stable identifier (e.g. `coach`, `player`, `venue`).',
        }),
        name: t.exposeString('name', { description: 'Display label.' }),
        defaultFormulaId: t.exposeID('defaultFormulaId', {
            nullable: true,
            description:
                'References `ranking_formulas.id`. Null in v1 — the formula seam is wired so a future PR can flip on objective ranking without a migration.',
        }),
    }),
});

builder.objectType(TierListRef, {
    description:
        'A live-editable ranking. Identified by a stable UUID — share this id, not the internal numeric position.',
    fields: (t) => ({
        id: t.exposeID('id'),
        userId: t.exposeID('userId', {
            description: 'Owner (domain user UUID). Only the owner or an admin can read this tier list.',
        }),
        seasonId: t.exposeID('seasonId', { description: 'Season this tier list is scoped to.' }),
        tierRankableTypeId: t.exposeString('tierRankableTypeId', {
            description: 'Which recipe this list ranks against. FK to `TierRankableType.id`.',
        }),
        tierRankableType: t.field({
            type: TierRankableTypeRef,
            nullable: true,
            description: 'The recipe row this list ranks against. Batched via DataLoader.',
            resolve: (parent, _args, ctx) =>
                ctx.loaders.tierRankableTypeLoader.load(parent.tierRankableTypeId),
        }),
        title: t.exposeString('title', { description: 'Display title.' }),
        tiers: t.field({
            type: [TierRef],
            description: 'Ordered tier scheme, top-to-bottom. Items reference `tier.key`.',
            resolve: (parent) => parent.tiers,
        }),
        displayConfig: t.field({
            type: TierListDisplayConfigRef,
            description:
                'Per-list display preferences (e.g. `showTeamNames`). Always returned with every key populated.',
            resolve: (parent) => parent.displayConfig,
        }),
        isLocked: t.exposeBoolean('isLocked', {
            description:
                'User-flipped read-only flag. When true, the editor renders read-only and all edit mutations on this list (and its items) throw `TIER_LIST_LOCKED`. The same user can flip it back any time via `setTierListLocked`.',
        }),
        items: t.field({
            type: [TierRankableItemRef],
            description:
                'Live items belonging to this tier list, ordered by `(tierKey, position)`. Items with `tierKey = null` are in the pool row.',
            resolve: (parent, _args, ctx) =>
                ctx.loaders.tierRankableItemsLoader.load(parent.id),
        }),
        createdAt: t.expose('createdAt', { type: 'DateTime' }),
        updatedAt: t.expose('updatedAt', {
            type: 'DateTime',
            description: 'Last-modified time — surface this as "Edited HH:MM" in the editor.',
        }),
        deletedAt: t.expose('deletedAt', {
            type: 'DateTime',
            nullable: true,
            description:
                'Set when the tier list was soft-deleted. Live queries filter these out — surfaced here for admin tooling.',
        }),
    }),
});

builder.objectType(TierRankableItemRef, {
    description:
        'One item in a tier list. Carries the recipe\'s projection snapshot (`name`, `imageUrl`, `team`, source pointer) plus per-user overrides. `(tierRankableTypeId, naturalKey)` is the cross-user identity for an instance.',
    fields: (t) => ({
        id: t.exposeID('id'),
        tierKey: t.exposeString('tierKey', {
            nullable: true,
            description: 'null = in the pool. Non-null = in that tier on the parent.',
        }),
        position: t.exposeFloat('position', {
            description:
                'Float per row. Reorder by midpoint — insert between A=1.0 and B=2.0 by writing 1.5.',
        }),
        tierRankableTypeId: t.exposeString('tierRankableTypeId', {
            description: "Recipe this item was projected by. Matches parent tier list's recipe.",
        }),
        tierRankableType: t.field({
            type: TierRankableTypeRef,
            nullable: true,
            description: "The recipe row. Batched via DataLoader.",
            resolve: (parent, _args, ctx) =>
                ctx.loaders.tierRankableTypeLoader.load(parent.tierRankableTypeId),
        }),
        naturalKey: t.exposeString('naturalKey', {
            description:
                "Recipe-derived stable instance id (e.g. `<teamId>|pep guardiola`). `(tierRankableTypeId, naturalKey)` groups items across users.",
        }),
        name: t.exposeString('name', {
            description:
                "Canonical display name snapshotted at add time. Refresh-from-source overwrites this; items can override per-user.",
        }),
        imageUrl: t.exposeString('imageUrl', { nullable: true }),
        team: t.field({
            type: TeamRef,
            nullable: true,
            description: 'Team this item is associated with. Resolved from `teamId` via DataLoader.',
            resolve: (parent, _args, ctx) =>
                parent.teamId ? ctx.loaders.teamLoader.load(parent.teamId) : null,
        }),
        sourceType: t.exposeString('sourceType', { nullable: true }),
        sourceId: t.exposeID('sourceId', { nullable: true }),
        sourcePath: t.field({
            type: 'JSON',
            nullable: true,
            resolve: (parent) => parent.sourcePath,
        }),
        nameOverride: t.exposeString('nameOverride', {
            nullable: true,
            description: "User's custom name. Null = use the snapshot. Display: `nameOverride ?? name`.",
        }),
        imageUrlOverride: t.exposeString('imageUrlOverride', {
            nullable: true,
            description: "User's custom image. Null = use the snapshot.",
        }),
        subtitle: t.exposeString('subtitle', {
            nullable: true,
            description: 'Per-user secondary line (e.g. striker position, venue capacity).',
        }),
        displayName: t.string({
            description: 'Convenience: `nameOverride ?? name`.',
            resolve: (parent) => parent.nameOverride ?? parent.name,
        }),
        displayImageUrl: t.string({
            nullable: true,
            description: 'Convenience: `imageUrlOverride ?? imageUrl`.',
            resolve: (parent) => parent.imageUrlOverride ?? parent.imageUrl,
        }),
        addedAt: t.expose('addedAt', { type: 'DateTime' }),
    }),
});

// ----------------------------------------------------------------------
// Inputs
// ----------------------------------------------------------------------

const TierInput = builder.inputType('TierInput', {
    description:
        'A tier in a tier list\'s scheme. `key` is optional — leave null for new tiers and the server will mint a fresh stable key. For existing tiers, pass the key back to preserve identity.',
    fields: (t) => ({
        key: t.string({ required: false }),
        name: t.string({ required: true }),
    }),
});

const AddTierRankableItemInput = builder.inputType('AddTierRankableItemInput', {
    description:
        "Payload for `addTierRankableItem`. The client (editor add-drawer) runs the recipe over a source row to compute the projection, then passes it here. The server stores it verbatim. Recipe id must match the parent tier list's `tierRankableTypeId`.",
    fields: (t) => ({
        tierListId: t.id({ required: true }),
        tierRankableTypeId: t.string({
            required: true,
            description: "Must match parent tier list's recipe.",
        }),
        naturalKey: t.string({
            required: true,
            description: 'Recipe-derived stable instance id. Drives cross-user aggregates.',
        }),
        name: t.string({ required: true }),
        imageUrl: t.string({ required: false }),
        teamId: t.id({ required: false }),
        sourceType: t.string({ required: false }),
        sourceId: t.id({ required: false }),
        sourcePath: t.field({ type: 'JSON', required: false }),
    }),
});

const UpdateTierRankableItemOverridesInput = builder.inputType(
    'UpdateTierRankableItemOverridesInput',
    {
        description:
            'Per-user override patch. Fields left undefined are not changed. Pass `null` explicitly to clear an override (fall back to the snapshot).',
        fields: (t) => ({
            itemId: t.id({ required: true }),
            nameOverride: t.string({ required: false }),
            imageUrlOverride: t.string({ required: false }),
            subtitle: t.string({ required: false }),
        }),
    },
);

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

type AbilityCtx = Parameters<typeof abilityOf>[0];

function assertViewer(ctx: AbilityCtx): { id: string; roles: string[] } {
    if (!ctx.user) {
        throw new GraphQLError('Unauthenticated', { extensions: { http: { status: 401 } } });
    }
    return ctx.user;
}

function assertNotLocked(parent: { isLocked: boolean }): void {
    if (parent.isLocked) {
        throw new GraphQLError('Tier list is locked', {
            extensions: { code: 'TIER_LIST_LOCKED', http: { status: 409 } },
        });
    }
}

function validateTitle(title: string): void {
    if (title.trim().length === 0) {
        throw new GraphQLError('Title cannot be blank', {
            extensions: { code: 'INVALID_TITLE', http: { status: 400 } },
        });
    }
    if (title.length > MAX_TITLE_LENGTH) {
        throw new GraphQLError(`Title exceeds ${MAX_TITLE_LENGTH} characters`, {
            extensions: { code: 'INVALID_TITLE', http: { status: 400 } },
        });
    }
}

function newTierKey(): string {
    return `tier-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

// ----------------------------------------------------------------------
// Pool-candidate discovery
// ----------------------------------------------------------------------

/**
 * Project a recipe projection onto the candidate shape (adds the
 * display-only `subtitle` field with a recipe-specific default of null).
 */
function toCandidate(
    projection: TierRankableTypeProjection,
    subtitle: string | null = null,
): CandidateShape {
    return {
        tierRankableTypeId: '',
        naturalKey: projection.naturalKey,
        name: projection.name,
        imageUrl: projection.imageUrl,
        teamId: projection.teamId,
        sourceType: projection.sourceType,
        sourceId: projection.sourceId,
        sourcePath: projection.sourcePath,
        subtitle,
    };
}

/**
 * Coach discovery: reads from the first-class `coaches` table.
 *
 * Cold cache: for any team in the season that doesn't yet have a coach
 * row, fetch it via `/coachs?team=<sourceId>` and upsert. Calls are
 * parallelised but bounded to one per uncached team, so a 24-team
 * season is at most 24 upstream calls (vs. one per fixture under the
 * old lineup-scraping path).
 *
 * Warm cache: pure DB read. The result is also cached in-memory at
 * TTL.STABLE so repeated drawer opens don't even touch the DB.
 */
async function discoverCoachCandidates(seasonId: string): Promise<CandidateShape[]> {
    const cacheKey = `pool-candidates:coach:${seasonId}`;
    const cached = cacheService.get<CandidateShape[]>(cacheKey);
    if (cached) return cached;

    const teams = await repository.teams.getTeamsBySeasonId(seasonId);
    if (teams.length === 0) {
        cacheService.set(cacheKey, [], TTL.STABLE);
        return [];
    }

    const existingCoaches = await repository.coaches.getCoachesBySeasonId(seasonId);
    const coachByTeamId = new Map(existingCoaches.map((c) => [c.teamId, c]));

    // Lazy-sync any team missing a coach row. Parallelised so a cold
    // cache fills in roughly one round-trip rather than 24.
    const missingTeams = teams.filter((t) => !coachByTeamId.has(t.id));
    if (missingTeams.length > 0) {
        const synced = await Promise.all(
            missingTeams.map((t) =>
                repository.coaches.getOrSyncCoachForTeam(t.id, t.sourceId),
            ),
        );
        for (const c of synced) {
            if (c?.teamId) coachByTeamId.set(c.teamId, c);
        }
    }

    const candidates: CandidateShape[] = [];
    for (const coach of coachByTeamId.values()) {
        if (!coach.teamId) continue;
        try {
            const projection = await coachRecipe.project(
                {
                    coachId: coach.id,
                    teamId: coach.teamId,
                    name: coach.name,
                    photo: coach.photo,
                },
                // The coach recipe doesn't use the context any more.
                { resolveTeamIdsBySource: async () => new Map() },
            );
            const candidate = toCandidate(projection);
            candidate.tierRankableTypeId = 'coach';
            candidates.push(candidate);
        } catch {
            // Coach without a name slips through here — skip.
        }
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));
    cacheService.set(cacheKey, candidates, TTL.STABLE);
    return candidates;
}

/**
 * Venue discovery: venues are first-class rows we already store, so
 * this is just a DB query + projection. No upstream calls.
 *
 * Venues don't carry a team FK directly — instead we reverse-lookup
 * via `teams.venueId` to find the team that calls this venue home.
 * That lets the universal item renderer surface the home team's name
 * + crest on a venue tier item just like it does for coaches. A
 * venue shared by multiple teams falls back to whichever team the
 * map returns first (stadium-sharing is rare in the v1 leagues).
 */
async function discoverVenueCandidates(seasonId: string): Promise<CandidateShape[]> {
    const cacheKey = `pool-candidates:venue:${seasonId}`;
    const cached = cacheService.get<CandidateShape[]>(cacheKey);
    if (cached) return cached;

    const [venues, teams] = await Promise.all([
        repository.teams.getVenuesBySeasonId(seasonId),
        repository.teams.getTeamsBySeasonId(seasonId),
    ]);

    const teamByVenueId = new Map<string, string>();
    for (const team of teams) {
        if (team.venueId && !teamByVenueId.has(team.venueId)) {
            teamByVenueId.set(team.venueId, team.id);
        }
    }

    const candidates: CandidateShape[] = [];
    for (const v of venues) {
        try {
            const projection = await venueRecipe.project(
                {
                    venueId: v.id,
                    name: v.name,
                    image: v.image,
                    city: v.city,
                    capacity: v.capacity,
                },
                { resolveTeamIdsBySource: async () => new Map() },
            );
            const subtitle =
                v.city && v.capacity
                    ? `${v.city} · ${v.capacity.toLocaleString()} seats`
                    : (v.city ?? (v.capacity ? `${v.capacity.toLocaleString()} seats` : null));
            const candidate = toCandidate(projection, subtitle);
            candidate.tierRankableTypeId = 'venue';
            // Attach the home team so the renderer can show the team
            // name + crest on venue items.
            candidate.teamId = teamByVenueId.get(v.id) ?? null;
            candidates.push(candidate);
        } catch {
            // skip malformed venues
        }
    }
    candidates.sort((a, b) => a.name.localeCompare(b.name));
    cacheService.set(cacheKey, candidates, TTL.STABLE);
    return candidates;
}

// ----------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------

builder.queryField('tierRankableTypes', (t) =>
    t.field({
        type: [TierRankableTypeRef],
        description:
            'All registered recipes. Drives the create-tier-list category picker on the client.',
        resolve: () => repository.tierLists.listTierRankableTypes(),
    }),
);

builder.queryField('myTierLists', (t) =>
    t.field({
        type: [TierListRef],
        description:
            "The viewer's tier lists for a season, newest first. Returns [] for unauthenticated callers so the overview page can render a signed-out state without error handling.",
        args: {
            seasonId: t.arg.id({ required: true }),
            tierRankableTypeId: t.arg.string({
                required: false,
                description: "Optional recipe filter (e.g. 'coach'). Omit to list all.",
            }),
        },
        resolve: async (_root, { seasonId, tierRankableTypeId }, ctx) => {
            if (!ctx.user) return [];
            if (abilityOf(ctx).cannot('read', 'TierList')) return [];
            return repository.tierLists.listTierLists({
                userId: ctx.user.id,
                seasonId: seasonId as string,
                tierRankableTypeId: tierRankableTypeId ?? undefined,
            });
        },
    }),
);

builder.queryField('tierRankableItemCandidates', (t) =>
    t.field({
        type: [TierRankableItemCandidateRef],
        description:
            "Discover pool candidates for a (season, recipe). The server walks the recipe's source data — for `coach`, a bounded set of recent fixtures' lineups; for `venue`, the season's venues — and returns ready-to-submit projections. Drives the pool add drawer. Results are cached (TTL.STABLE) so repeated drawer opens don't hammer the upstream provider.",
        args: {
            seasonId: t.arg.id({ required: true }),
            tierRankableTypeId: t.arg.string({ required: true }),
        },
        resolve: async (_root, { seasonId, tierRankableTypeId }, ctx) => {
            assertViewer(ctx);
            const seasonIdStr = seasonId as string;
            switch (tierRankableTypeId) {
                case 'coach':
                    return discoverCoachCandidates(seasonIdStr);
                case 'venue':
                    return discoverVenueCandidates(seasonIdStr);
                default:
                    throw new GraphQLError(
                        `Unknown tier rankable type: ${tierRankableTypeId}`,
                        {
                            extensions: {
                                code: 'UNKNOWN_TIER_RANKABLE_TYPE',
                                http: { status: 400 },
                                tierRankableTypeId,
                            },
                        },
                    );
            }
        },
    }),
);

builder.queryField('tierList', (t) =>
    t.field({
        type: TierListRef,
        nullable: true,
        description:
            'Returns the tier list when the viewer is the owner or an admin, otherwise null. Soft-deleted rows are treated as non-existent.',
        args: { id: t.arg.id({ required: true }) },
        resolve: async (_root, { id }, ctx) => {
            const row = await repository.tierLists.getTierListById({ id: id as string });
            if (!row) return null;
            if (abilityOf(ctx).cannot('read', subject('TierList', { userId: row.userId }))) {
                return null;
            }
            return row;
        },
    }),
);

// ----------------------------------------------------------------------
// Tier-list mutations
// ----------------------------------------------------------------------

builder.mutationField('createTierList', (t) =>
    t.field({
        type: TierListRef,
        description:
            "Create a new tier list for the viewer. Initialises the default S/A/B/C/D/F tier scheme. Enforces the per-(user, season) cap that counts soft-deleted rows. `tierRankableTypeId` must reference a registered recipe.",
        args: {
            seasonId: t.arg.id({ required: true }),
            tierRankableTypeId: t.arg.string({ required: true }),
            title: t.arg.string({ required: true }),
        },
        resolve: async (_root, { seasonId, tierRankableTypeId, title }, ctx) => {
            const viewer = assertViewer(ctx);
            if (abilityOf(ctx).cannot('create', 'TierList')) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            validateTitle(title);

            const recipe = await repository.tierLists.getTierRankableTypeById(tierRankableTypeId);
            if (!recipe) {
                throw new GraphQLError(`Unknown tier rankable type: ${tierRankableTypeId}`, {
                    extensions: {
                        code: 'UNKNOWN_TIER_RANKABLE_TYPE',
                        http: { status: 400 },
                        tierRankableTypeId,
                    },
                });
            }

            const seasonIdStr = seasonId as string;
            const count = await repository.tierLists.countTierListsInScope({
                userId: viewer.id,
                seasonId: seasonIdStr,
            });
            if (count >= MAX_TIER_LISTS_PER_USER_PER_SEASON) {
                throw new GraphQLError(
                    `Tier list limit reached for this season (${count}/${MAX_TIER_LISTS_PER_USER_PER_SEASON})`,
                    {
                        extensions: {
                            code: 'TIER_LIST_LIMIT_REACHED',
                            http: { status: 409 },
                            count,
                            limit: MAX_TIER_LISTS_PER_USER_PER_SEASON,
                        },
                    },
                );
            }

            return repository.tierLists.createTierList({
                userId: viewer.id,
                seasonId: seasonIdStr,
                tierRankableTypeId,
                title,
                tiers: DEFAULT_TIERS.map((t) => ({ ...t })),
            });
        },
    }),
);

builder.mutationField('updateTierListTitle', (t) =>
    t.field({
        type: TierListRef,
        description: 'Owner-only title update. Validates length.',
        args: {
            id: t.arg.id({ required: true }),
            title: t.arg.string({ required: true }),
        },
        resolve: async (_root, { id, title }, ctx) => {
            assertViewer(ctx);
            const existing = await repository.tierLists.getTierListById({ id: id as string });
            if (!existing) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: existing.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            assertNotLocked(existing);
            validateTitle(title);
            const updated = await repository.tierLists.updateTierListTitle(
                id as string,
                title,
            );
            if (!updated) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            return updated;
        },
    }),
);

builder.mutationField('updateTierListTiers', (t) =>
    t.field({
        type: TierListRef,
        description:
            'Replace the tier scheme. Existing tier keys are preserved on rename; new tiers (those with no `key` in the input) get fresh keys. Items whose tier was removed are atomically rebased to `tierKey = null` (returned to the pool).',
        args: {
            id: t.arg.id({ required: true }),
            tiers: t.arg({ type: [TierInput], required: true }),
        },
        resolve: async (_root, { id, tiers }, ctx) => {
            assertViewer(ctx);
            const existing = await repository.tierLists.getTierListById({ id: id as string });
            if (!existing) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: existing.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            assertNotLocked(existing);

            if (tiers.length < MIN_TIERS || tiers.length > MAX_TIERS) {
                throw new GraphQLError(
                    `Tier count must be between ${MIN_TIERS} and ${MAX_TIERS} (got ${tiers.length})`,
                    {
                        extensions: {
                            code: 'INVALID_TIER_COUNT',
                            http: { status: 400 },
                            min: MIN_TIERS,
                            max: MAX_TIERS,
                            received: tiers.length,
                        },
                    },
                );
            }

            const seenKeys = new Set<string>();
            const resolved: Tier[] = tiers.map((t) => {
                const key = t.key ?? newTierKey();
                if (seenKeys.has(key)) {
                    throw new GraphQLError(`Duplicate tier key: ${key}`, {
                        extensions: { code: 'INVALID_TIER_COUNT', http: { status: 400 } },
                    });
                }
                seenKeys.add(key);
                if (t.name.trim().length === 0) {
                    throw new GraphQLError('Tier name cannot be blank', {
                        extensions: { code: 'INVALID_TIER_COUNT', http: { status: 400 } },
                    });
                }
                return { key, name: t.name };
            });

            const updated = await repository.tierLists.updateTierListTiers(
                id as string,
                resolved,
            );
            if (!updated) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            return updated;
        },
    }),
);

builder.mutationField('updateTierListDisplayConfig', (t) =>
    t.field({
        type: TierListRef,
        description:
            'Patch the per-list display preferences (e.g. `showTeamNames`). Locked lists reject this with `TIER_LIST_LOCKED`.',
        args: {
            id: t.arg.id({ required: true }),
            displayConfig: t.arg({ type: TierListDisplayConfigInput, required: true }),
        },
        resolve: async (_root, { id, displayConfig }, ctx) => {
            assertViewer(ctx);
            const existing = await repository.tierLists.getTierListById({ id: id as string });
            if (!existing) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: existing.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            assertNotLocked(existing);
            const normalised = normaliseDisplayConfig({
                showTeamNames: displayConfig.showTeamNames,
                showTeamLogos: displayConfig.showTeamLogos,
            });
            const updated = await repository.tierLists.updateTierListDisplayConfig(
                id as string,
                normalised,
            );
            if (!updated) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            return updated;
        },
    }),
);

builder.mutationField('setTierListLocked', (t) =>
    t.field({
        type: TierListRef,
        description:
            "Flip the user-controlled read-only flag. Lock is never permanent — the same user (or admin) can unlock the list any time. Locked lists reject every other edit mutation with `TIER_LIST_LOCKED`, so this mutation deliberately does NOT check the flag itself (otherwise locking would be a one-way door).",
        args: {
            id: t.arg.id({ required: true }),
            locked: t.arg.boolean({ required: true }),
        },
        resolve: async (_root, { id, locked }, ctx) => {
            assertViewer(ctx);
            const existing = await repository.tierLists.getTierListById({ id: id as string });
            if (!existing) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: existing.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            const updated = await repository.tierLists.setTierListLocked(
                id as string,
                locked,
            );
            if (!updated) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            return updated;
        },
    }),
);

builder.mutationField('deleteTierList', (t) =>
    t.id({
        description:
            'Soft-delete a tier list (sets `deletedAt`). Idempotent on already-deleted rows. Owner or admin only. Returns the tier list id.',
        args: { id: t.arg.id({ required: true }) },
        resolve: async (_root, { id }, ctx) => {
            assertViewer(ctx);
            const existing = await repository.tierLists.getTierListById({
                id: id as string,
                includeDeleted: true,
            });
            if (!existing) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'delete',
                    subject('TierList', { userId: existing.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            const deletedId = await repository.tierLists.softDeleteTierList(existing.id);
            return deletedId ?? existing.id;
        },
    }),
);

// ----------------------------------------------------------------------
// TierRankableItem mutations
// ----------------------------------------------------------------------

builder.mutationField('addTierRankableItem', (t) =>
    t.field({
        type: TierRankableItemRef,
        description:
            "Append a new item to the parent tier list. The client runs the recipe over a source row (fixture lineup for a coach, player row for a striker, …) to compute the projection and passes it here. Server validates the recipe match, source-pointer integrity, `teamId` FK, and the cap, then inserts the slot verbatim.",
        args: { input: t.arg({ type: AddTierRankableItemInput, required: true }) },
        resolve: async (_root, { input }, ctx) => {
            assertViewer(ctx);
            const parent = await repository.tierLists.getTierListById({
                id: input.tierListId as string,
            });
            if (!parent) {
                throw new GraphQLError('Tier list not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: parent.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            assertNotLocked(parent);

            if (input.tierRankableTypeId !== parent.tierRankableTypeId) {
                throw new GraphQLError(
                    `Recipe '${input.tierRankableTypeId}' does not match tier list recipe '${parent.tierRankableTypeId}'`,
                    {
                        extensions: { code: 'RECIPE_MISMATCH', http: { status: 400 } },
                    },
                );
            }

            if (input.name.trim().length === 0) {
                throw new GraphQLError('Item name cannot be blank', {
                    extensions: { code: 'INVALID_ITEM', http: { status: 400 } },
                });
            }
            if (input.naturalKey.trim().length === 0) {
                throw new GraphQLError('Natural key cannot be blank', {
                    extensions: { code: 'INVALID_ITEM', http: { status: 400 } },
                });
            }

            // Source-pointer contract: both null or both set. Surfaced as a
            // typed error so the client can show a meaningful message rather
            // than a generic 23514 CHECK violation from Postgres.
            const sourceTypeSet =
                input.sourceType !== null && input.sourceType !== undefined;
            const sourceIdSet = input.sourceId !== null && input.sourceId !== undefined;
            if (sourceTypeSet !== sourceIdSet) {
                throw new GraphQLError(
                    'sourceType and sourceId must be set together (or both null for a freeform item)',
                    {
                        extensions: { code: 'INVALID_SOURCE_POINTER', http: { status: 400 } },
                    },
                );
            }

            const teamId = (input.teamId as string | null | undefined) ?? null;
            if (teamId) {
                const team = await ctx.loaders.teamLoader.load(teamId);
                if (!team) {
                    throw new GraphQLError('teamId does not reference a known team', {
                        extensions: { code: 'TEAM_NOT_FOUND', http: { status: 400 } },
                    });
                }
            }

            const count = await repository.tierLists.countItemsForTierList(parent.id);
            if (count >= MAX_ITEMS_PER_TIER_LIST) {
                throw new GraphQLError(
                    `Item limit reached for this tier list (${count}/${MAX_ITEMS_PER_TIER_LIST})`,
                    {
                        extensions: {
                            code: 'ITEM_LIMIT_REACHED',
                            http: { status: 409 },
                            count,
                            limit: MAX_ITEMS_PER_TIER_LIST,
                        },
                    },
                );
            }

            return repository.tierLists.addTierRankableItem({
                tierListId: parent.id,
                tierRankableTypeId: input.tierRankableTypeId,
                naturalKey: input.naturalKey,
                name: input.name,
                imageUrl: input.imageUrl ?? null,
                teamId,
                sourceType: input.sourceType ?? null,
                sourceId: (input.sourceId as string | null | undefined) ?? null,
                sourcePath: input.sourcePath ?? null,
            });
        },
    }),
);

builder.mutationField('updateTierRankableItemOverrides', (t) =>
    t.field({
        type: TierRankableItemRef,
        description:
            'Update the per-user overrides on a tier rankable item (name, image, subtitle). Pass `null` to clear an override, omit the field to leave it untouched. Owner only.',
        args: {
            input: t.arg({ type: UpdateTierRankableItemOverridesInput, required: true }),
        },
        resolve: async (_root, { input }, ctx) => {
            assertViewer(ctx);
            const item = await repository.tierLists.getTierRankableItemById({
                itemId: input.itemId as string,
            });
            if (!item) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            const parent = await repository.tierLists.getTierListById({ id: item.tierListId });
            if (!parent) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: parent.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            assertNotLocked(parent);
            const updated = await repository.tierLists.updateTierRankableItemOverrides({
                itemId: item.id,
                nameOverride: input.nameOverride === undefined ? undefined : input.nameOverride,
                imageUrlOverride:
                    input.imageUrlOverride === undefined ? undefined : input.imageUrlOverride,
                subtitle: input.subtitle === undefined ? undefined : input.subtitle,
            });
            if (!updated) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            return updated;
        },
    }),
);

builder.mutationField('removeTierRankableItem', (t) =>
    t.id({
        description:
            'Soft-delete an item (sets `deletedAt`). Idempotent on already-deleted items. Returns the item id.',
        args: { itemId: t.arg.id({ required: true }) },
        resolve: async (_root, { itemId }, ctx) => {
            assertViewer(ctx);
            const item = await repository.tierLists.getTierRankableItemById({
                itemId: itemId as string,
                includeDeleted: true,
            });
            if (!item) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            const parent = await repository.tierLists.getTierListById({
                id: item.tierListId,
                includeDeleted: true,
            });
            if (!parent) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: parent.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            assertNotLocked(parent);
            const deletedId = await repository.tierLists.softDeleteTierRankableItem(item.id);
            return deletedId ?? item.id;
        },
    }),
);

builder.mutationField('moveTierRankableItem', (t) =>
    t.field({
        type: TierRankableItemRef,
        description:
            'Move an item to a new (tierKey, position). `tierKey = null` puts it back in the pool. Handles all four cases: pool→tier, tier→tier, tier→pool, reorder within row.',
        args: {
            itemId: t.arg.id({ required: true }),
            tierKey: t.arg.string({ required: false }),
            position: t.arg.float({ required: true }),
        },
        resolve: async (_root, { itemId, tierKey, position }, ctx) => {
            assertViewer(ctx);
            const item = await repository.tierLists.getTierRankableItemById({
                itemId: itemId as string,
            });
            if (!item) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            const parent = await repository.tierLists.getTierListById({ id: item.tierListId });
            if (!parent) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            if (
                abilityOf(ctx).cannot(
                    'update',
                    subject('TierList', { userId: parent.userId }),
                )
            ) {
                throw new GraphQLError('Forbidden', { extensions: { http: { status: 403 } } });
            }
            assertNotLocked(parent);

            if (tierKey !== null && tierKey !== undefined) {
                const known = parent.tiers.some((t) => t.key === tierKey);
                if (!known) {
                    throw new GraphQLError(`Unknown tier key: ${tierKey}`, {
                        extensions: {
                            code: 'UNKNOWN_TIER_KEY',
                            http: { status: 400 },
                            tierKey,
                        },
                    });
                }
            }

            const moved = await repository.tierLists.moveTierRankableItem({
                itemId: item.id,
                tierKey: tierKey ?? null,
                position,
            });
            if (!moved) {
                throw new GraphQLError('Item not found', {
                    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
                });
            }
            return moved;
        },
    }),
);
