/**
 * Client-side mirror of apps/service/src/auth/abilities.ts.
 *
 * The rule shapes here MUST match the server. The admin app uses this
 * ability to gate rendering (`<Can I="manage" a="all">`) so the same
 * authorisation logic that decides whether the server honours a mutation
 * decides whether the UI shows the trigger for it.
 *
 * Admin currently has no grants surface (the GraphQL query it issues only
 * fetches roles via `/api/auth/me`), but the seam is here for parity with
 * apps/web — once the admin app uses GraphQL viewer queries, grants drop in
 * without changes to the rule shape.
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
