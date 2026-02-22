import SchemaBuilder from '@pothos/core';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import { DateTimeResolver } from 'graphql-scalars';

export const builder = new SchemaBuilder<{
    Scalars: {
        DateTime: { Input: Date; Output: Date };
    };
}>({
    plugins: [SimpleObjectsPlugin],
});

builder.addScalarType('DateTime', DateTimeResolver, {});

builder.queryType({
    fields: (t) => ({
        health: t.string({
            resolve: () => 'Service is up and running!',
        }),
    }),
});

builder.mutationType({});
