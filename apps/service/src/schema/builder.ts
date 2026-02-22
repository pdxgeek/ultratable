import SchemaBuilder from '@pothos/core';

export const builder = new SchemaBuilder({});

builder.queryType({
    fields: (t) => ({
        health: t.string({
            resolve: () => 'Service is up and running!',
        }),
    }),
});

builder.mutationType({});
