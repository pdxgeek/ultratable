/**
 * Client-side mirror of apps/service/src/auth/abilities.ts.
 *
 * The rule shapes here MUST match the server. The frontend uses the same
 * ability object to decide whether to render gated UI (`<Can I="manage" a="all">`)
 * and the server uses it to decide whether to honour the resulting mutation.
 * If the two drift, you get the classic "the button appears but the click
 * 403s" footgun (or worse, the inverse: a hidden button that would have
 * worked).
 *
 * Grants come pre-loaded on `viewer.myGrants` so the ability is built
 * synchronously from the GraphQL response — no separate fetch.
 */
import type { MongoAbility } from '@casl/ability';

import { AbilityBuilder, createMongoAbility } from '@casl/ability';

// Re-export the CASL React primitives consumers will pair with the
// ability — `<Can>` for declarative gating and `useAbility()` for
// imperative checks inside hooks.
export { Can, useAbility } from '@casl/react';

export type AppAction =
    | 'manage'
    | 'read'
    | 'create'
    | 'update'
    | 'delete'
    | 'follow'
    | 'unfollow';

export type AppSubject = 'Account' | 'Viewer' | 'League' | 'OwnedResource' | 'all';

export type AppAbility = MongoAbility<[AppAction, AppSubject | object]>;

export interface AbilityViewer {
    id: string;
    roles: string[];
    myGrants?: Array<{ resourceType: string; resourceId: string; role: string }>;
}

export function buildAbility(viewer: AbilityViewer | null | undefined): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (!viewer) return build();

    can('manage', 'Account', { id: viewer.id });
    can('read', 'Viewer');
    can(['follow', 'unfollow'], 'League');
    can('manage', 'OwnedResource', { ownerId: viewer.id });

    for (const grant of viewer.myGrants ?? []) {
        if (grant.role === 'owner' || grant.role === 'admin') {
            can('manage', grant.resourceType as AppSubject, { id: grant.resourceId });
        } else {
            can('read', grant.resourceType as AppSubject, { id: grant.resourceId });
        }
    }

    if (viewer.roles.includes('admin')) {
        can('manage', 'all');
    }

    return build();
}
