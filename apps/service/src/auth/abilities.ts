/**
 * CASL ability builder for UltraTable.
 *
 * Every gate that decides "may the viewer do X" goes through here. The shape
 * is intentionally tiny right now — only the rules our current resolvers need
 * — but the seam for grant-based rules (per-resource shares like prediction
 * groups) is wired so that adding them later is one call site, not a refactor.
 *
 * Subjects:
 *   - 'Account'       — the domain `user` row (used by self-or-admin gates).
 *   - 'Viewer'        — read-only viewer surface ("is there a viewer at all").
 *   - 'League'        — public catalog league (any authenticated user may
 *                       follow/unfollow).
 *   - 'OwnedResource' — placeholder for any future resource that exposes
 *                       `ownerId`. The rule is in place so prediction groups
 *                       can register a subject type that satisfies the same
 *                       shape and inherit owner-can-manage automatically.
 *   - 'all'           — global wildcard, granted only to domain admins.
 *
 * The grant loader is a no-op today; prediction groups will populate it from
 * the still-to-be-defined `resource_grants` table without changing the
 * surrounding shape.
 */
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';

export interface ViewerCtx {
    id: string;
    roles: string[];
}

/**
 * One row from the (future) `resource_grants` table. A grant says "this
 * grantee has this role on this specific resource." The CASL rules
 * synthesised from grants are what make per-resource sharing work without
 * inlining access SQL into every list resolver.
 *
 * Today the loader returns [] and the rules layer is exercised only by
 * `OwnedResource` / global admin. Kept here so the contract for the next
 * ticket (prediction groups) doesn't move.
 */
export interface GrantRow {
    /** Subject type as registered in CASL (e.g. 'PredictionGroup'). */
    resourceType: string;
    /** UUID of the resource the grant applies to. */
    resourceId: string;
    /** Role within that resource (owner, admin, member). */
    role: string;
}

export type GrantLoader = (domainUserId: string) => Promise<GrantRow[]>;

const noGrants: GrantLoader = async () => [];

/**
 * Actions the rule set knows about. CASL also accepts arbitrary strings, but
 * keeping a finite list typed here means TypeScript will surface any drift
 * between resolvers and the ability shape at compile time.
 *
 * `manage` is CASL's special wildcard — it matches every action when checked.
 */
export type AppAction =
    | 'manage'
    | 'read'
    | 'create'
    | 'update'
    | 'delete'
    | 'follow'
    | 'unfollow';

export type AppSubject =
    | 'Account'
    | 'Viewer'
    | 'League'
    | 'OwnedResource'
    | 'Prediction'
    | 'GameweekPrediction'
    | 'TierList'
    | 'all';

export type AppAbility = MongoAbility<[AppAction, AppSubject | object]>;

/**
 * Synchronous builder. Returns an ability built from `viewer` + pre-loaded
 * grants. Use this when the grant rows are already in hand (tests, unit
 * checks, places where async context-construction is awkward).
 */
export function buildAbility(viewer: ViewerCtx | undefined, grants: GrantRow[] = []): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (!viewer) {
        // Guest: zero rules. Every `can()` check returns false.
        return build();
    }

    // Self-service: viewer may read/update/delete their own Account row.
    // `requireSelfOrAdmin(ctx, userId)` reduces to:
    //   ability.can('delete', subject('Account', { id: userId }))
    can('manage', 'Account', { id: viewer.id });

    // "Is there a viewer at all" — anything gated by `requireViewer` becomes
    // `ability.can('read', 'Viewer')` (no condition: the rule simply exists).
    can('read', 'Viewer');

    // Following a league is open to any authenticated user.
    can(['follow', 'unfollow'], 'League');

    // Owner rule. Any resource with an `ownerId` field gets manage-by-owner
    // for free once it's registered as a subject. Prediction groups will use
    // this directly; nothing in the current schema does today, so the rule is
    // inert until then.
    can('manage', 'OwnedResource', { ownerId: viewer.id });

    // Predictions. The 'predictions' role gates both the UI button and the
    // mutation surface. `create` is unconditional (the resolver pins userId
    // from the viewer); `read`/`delete` are owner-scoped via userId match.
    // Guests and other roles never get this — admins still bypass via the
    // global wildcard below.
    if (viewer.roles.includes('predictions')) {
        can('create', 'Prediction');
        can(['read', 'delete'], 'Prediction', { userId: viewer.id });
        // Gameweek predictions (#144) — same role, separate subject because
        // the entity is its own table + GraphQL type (the shared-table
        // approach was explored in #145 and rejected). Picks are part of
        // the GameweekPrediction aggregate, so `create` covers both
        // container creation and pick inserts; the entity has no mutable
        // state past insert, so there's no `update`.
        can('create', 'GameweekPrediction');
        can(['read', 'delete'], 'GameweekPrediction', { userId: viewer.id });
    }

    // Tier Lists. Same shape as Predictions: `create` is unconditional for
    // anyone with the 'tier-lists' role, owner-scoped read/update/delete via
    // userId match. Guests never get it; admins bypass via 'manage all'.
    if (viewer.roles.includes('tier-lists')) {
        can('create', 'TierList');
        can(['read', 'update', 'delete'], 'TierList', { userId: viewer.id });
    }

    // Grant-based rules. Each grant translates to one `can(...)` call.
    for (const grant of grants) {
        if (grant.role === 'owner' || grant.role === 'admin') {
            can('manage', grant.resourceType as AppSubject, { id: grant.resourceId });
        } else {
            can('read', grant.resourceType as AppSubject, { id: grant.resourceId });
        }
    }

    // Global admin: bypass every rule. Matches the old `requireAdmin` helper.
    if (viewer.roles.includes('admin')) {
        can('manage', 'all');
    }

    return build();
}

/**
 * Async ability constructor — loads grants for the viewer first, then hands
 * off to `buildAbility`. This is the version the GraphQL context factory
 * uses; tests that don't care about grants can call `buildAbility` directly.
 */
export async function abilityFor(
    viewer: ViewerCtx | undefined,
    loadGrants: GrantLoader = noGrants,
): Promise<AppAbility> {
    if (!viewer) return buildAbility(undefined);
    const grants = await loadGrants(viewer.id);
    return buildAbility(viewer, grants);
}
