import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppAbility } from '../auth/abilities';
import type { Loaders } from '../loaders';

import { subject } from '@casl/ability';
import SchemaBuilder from '@pothos/core';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import { GraphQLError } from 'graphql';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';

import { buildAbility } from '../auth/abilities';

export interface Context {
    req: FastifyRequest;
    reply?: FastifyReply;
    user?: {
        id: string;
        roles: string[];
    };
    /** Better Auth's auth_user.id for the current session, when authenticated. */
    authUserId?: string;
    loaders: Loaders;
    /**
     * Per-request CASL ability. The production context factory in `index.ts`
     * builds this with the (eventually async) grant loader; legacy callers
     * that don't supply one fall through to `abilityOf(ctx)` below, which
     * derives a grant-free ability from `ctx.user`. The optional shape keeps
     * existing test factories working unmodified.
     */
    ability?: AppAbility;
}

/**
 * Resolver-side accessor for the per-request ability. Prefer this over
 * `ctx.ability!` so contexts constructed without an ability (older test
 * harnesses, util scripts) still get a correctly-shaped grant-free ability
 * derived from `ctx.user`.
 */
export const abilityOf = (ctx: Context): AppAbility => ctx.ability ?? buildAbility(ctx.user);

export const builder = new SchemaBuilder<{
    Context: Context;
    Scalars: {
        DateTime: { Input: Date; Output: Date };
        JSON: { Input: unknown; Output: unknown };
    };
}>({
    plugins: [SimpleObjectsPlugin],
});

builder.addScalarType('DateTime', DateTimeResolver, {});
builder.addScalarType('JSON', JSONResolver, {});

builder.queryType({
    fields: (t) => ({
        health: t.string({
            description:
                'Simple health check endpoint. Returns a confirmation string when the service is running.',
            resolve: () => 'Service is up and running!',
        }),
    }),
});

builder.mutationType({});

// Re-export ability helpers so resolver files import everything from one place.
export { abilityFor, buildAbility } from '../auth/abilities';

/**
 * Legacy gate helpers. New code should call `abilityOf(ctx).can(...)` (or
 * `abilityOf(ctx).cannot(...)` to invert) directly — these wrappers exist
 * so the migration happens incrementally instead of in one giant diff.
 * They translate to the same CASL checks so behaviour is identical.
 *
 * The error shapes (`Unauthenticated` / `Forbidden`) are load-bearing —
 * `rbac.test.ts` and `account.test.ts` match on these strings.
 */

export const requireAdmin = (ctx: Context) => {
    if (!ctx.user) {
        throw new GraphQLError('Unauthenticated', {
            extensions: { http: { status: 401 } },
        });
    }
    if (!abilityOf(ctx).can('manage', 'all')) {
        throw new GraphQLError('Forbidden: Requires Admin Role', {
            extensions: { http: { status: 403 } },
        });
    }
};

/**
 * Returns the signed-in viewer or throws Unauthenticated. Use this on any
 * resolver that mutates / reads data tied to the caller's own identity.
 * Centralized here so the auth surface is auditable from one file.
 */
export const requireViewer = (ctx: Context): { id: string; roles: string[] } => {
    if (!ctx.user || !abilityOf(ctx).can('read', 'Viewer')) {
        throw new GraphQLError('Unauthenticated', {
            extensions: { http: { status: 401 } },
        });
    }
    return ctx.user;
};

/**
 * Gate for resolvers that take a target user id (e.g. `deleteUserAccount`).
 * Passes when the viewer is the target, OR the viewer has the admin role.
 * Everyone else gets 403. Pairs with `requireViewer` — never bypasses auth.
 */
export const requireSelfOrAdmin = (ctx: Context, targetUserId: string): void => {
    requireViewer(ctx);
    if (!abilityOf(ctx).can('delete', subject('Account', { id: targetUserId }))) {
        throw new GraphQLError('Forbidden', {
            extensions: { http: { status: 403 } },
        });
    }
};
