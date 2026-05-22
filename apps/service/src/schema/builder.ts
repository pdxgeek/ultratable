import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Loaders } from '../loaders';

import SchemaBuilder from '@pothos/core';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import { GraphQLError } from 'graphql';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';

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
}

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

export const requireAdmin = (ctx: Context) => {
    if (!ctx.user) {
        throw new GraphQLError('Unauthenticated', {
            extensions: { http: { status: 401 } },
        });
    }
    if (!ctx.user.roles.includes('admin')) {
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
    if (!ctx.user) {
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
    const viewer = requireViewer(ctx);
    if (viewer.id === targetUserId) return;
    if (viewer.roles.includes('admin')) return;
    throw new GraphQLError('Forbidden', {
        extensions: { http: { status: 403 } },
    });
};
