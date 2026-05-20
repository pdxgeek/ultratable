import SchemaBuilder from '@pothos/core';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { GraphQLError } from 'graphql';
import type { Loaders } from '../loaders';

export interface Context {
    req: FastifyRequest;
    reply?: FastifyReply;
    user?: {
        id: string;
        roles: string[];
    };
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
            description: 'Simple health check endpoint. Returns a confirmation string when the service is running.',
            resolve: () => 'Service is up and running!',
        }),
        me: t.string({
            resolve: (parent, args, ctx) => {
                if (!ctx.user) {
                    throw new GraphQLError('Unauthenticated', {
                        extensions: { http: { status: 401 } }
                    });
                }
                return `Authenticated as user ${ctx.user.id} with roles ${ctx.user.roles.join(', ')}`;
            }
        })
    }),
});

builder.mutationType({});

export const requireAdmin = (ctx: Context) => {
    if (!ctx.user) {
        throw new GraphQLError('Unauthenticated', {
            extensions: { http: { status: 401 } }
        });
    }
    if (!ctx.user.roles.includes('admin')) {
        throw new GraphQLError('Forbidden: Requires Admin Role', {
            extensions: { http: { status: 403 } }
        });
    }
};
