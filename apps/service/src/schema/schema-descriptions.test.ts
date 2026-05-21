import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

import { builder } from './builder';

import './football';
import './catalog';
import './workers';
import './graphics';

/**
 * These tests use GraphQL introspection to verify that every type, field,
 * query, mutation, and argument in the schema has a non-empty description.
 * If a new field is added without a description, these tests will catch it.
 */

const yoga = createYoga({ schema: builder.toSchema() });

async function introspect(query: string) {
    const response = await yoga.fetch('http://localhost:8080/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    return response.json();
}

// Types defined by our schema that must be fully documented
const APP_TYPES = [
    'Venue',
    'League',
    'Team',
    'Season',
    'Fixture',
    'MatchEvent',
    'Player',
    'Lineup',
    'RankingFormula',
    'SourceInfo',
    'CatalogCountry',
    'CatalogLeague',
    'CatalogSeason',
    'Job',
    'JobExecution',
    'SystemLog',
    'Graphic',
    'SyncCatalogResult',
];

describe('Schema Description Coverage', () => {
    it('every field on application types should have a description', async () => {
        const result = await introspect(`{
            __schema {
                types {
                    name
                    kind
                    fields {
                        name
                        description
                    }
                }
            }
        }`);

        const missing: string[] = [];

        for (const type of result.data.__schema.types) {
            if (!APP_TYPES.includes(type.name)) continue;
            if (!type.fields) continue;

            for (const field of type.fields) {
                if (!field.description || field.description.trim() === '') {
                    missing.push(`${type.name}.${field.name}`);
                }
            }
        }

        expect(missing, `Fields missing descriptions:\n${missing.join('\n')}`).toEqual([]);
    });

    it('every query should have a description', async () => {
        const result = await introspect(`{
            __schema {
                queryType {
                    fields {
                        name
                        description
                    }
                }
            }
        }`);

        const missing: string[] = [];
        for (const field of result.data.__schema.queryType.fields) {
            // Skip the introspection 'me' query (it's a simple auth check)
            if (field.name === 'me' || field.name.startsWith('__')) continue;
            if (!field.description || field.description.trim() === '') {
                missing.push(`Query.${field.name}`);
            }
        }

        expect(missing, `Queries missing descriptions:\n${missing.join('\n')}`).toEqual([]);
    });

    it('every mutation should have a description', async () => {
        const result = await introspect(`{
            __schema {
                mutationType {
                    fields {
                        name
                        description
                    }
                }
            }
        }`);

        const missing: string[] = [];
        for (const field of result.data.__schema.mutationType.fields) {
            if (!field.description || field.description.trim() === '') {
                missing.push(`Mutation.${field.name}`);
            }
        }

        expect(missing, `Mutations missing descriptions:\n${missing.join('\n')}`).toEqual([]);
    });

    it('every query/mutation argument should have a description', async () => {
        const result = await introspect(`{
            __schema {
                queryType {
                    fields {
                        name
                        args { name description }
                    }
                }
                mutationType {
                    fields {
                        name
                        args { name description }
                    }
                }
            }
        }`);

        const missing: string[] = [];

        for (const field of result.data.__schema.queryType.fields) {
            if (field.name === 'me' || field.name.startsWith('__')) continue;
            for (const arg of field.args) {
                if (!arg.description || arg.description.trim() === '') {
                    missing.push(`Query.${field.name}(${arg.name})`);
                }
            }
        }

        for (const field of result.data.__schema.mutationType.fields) {
            for (const arg of field.args) {
                if (!arg.description || arg.description.trim() === '') {
                    missing.push(`Mutation.${field.name}(${arg.name})`);
                }
            }
        }

        expect(missing, `Arguments missing descriptions:\n${missing.join('\n')}`).toEqual([]);
    });

    it('player query should accept id (UUID) argument', async () => {
        const result = await introspect(`{
            __schema {
                queryType {
                    fields(includeDeprecated: true) {
                        name
                        args { name type { name kind } }
                    }
                }
            }
        }`);

        const playerQuery = result.data.__schema.queryType.fields.find(
            (f: { name: string }) => f.name === 'player',
        );
        expect(playerQuery, 'player query should exist').toBeDefined();

        const idArg = playerQuery.args.find((a: { name: string }) => a.name === 'id');
        expect(idArg, 'player query should have an id argument').toBeDefined();

        const sourceIdArg = playerQuery.args.find((a: { name: string }) => a.name === 'sourceId');
        expect(sourceIdArg, 'player query should still also accept sourceId').toBeDefined();
    });
});
