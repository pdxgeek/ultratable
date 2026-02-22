import { builder } from './builder';
import { repository } from '../repositories/supabase.repository';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { JobRunner } from '../workers/runner';
import { LeagueRef } from './football';

const CatalogCountryRef = builder.objectRef<any>('CatalogCountry');
const CatalogLeagueRef = builder.objectRef<any>('CatalogLeague');

builder.objectType(CatalogCountryRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        code: t.exposeString('code', { nullable: true }),
        flag: t.exposeString('flag', { nullable: true }),
        sourceName: t.exposeString('sourceName'),
    }),
});

builder.objectType(CatalogLeagueRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        countryId: t.exposeString('countryId'),
        name: t.exposeString('name'),
        type: t.exposeString('type', { nullable: true }),
        logo: t.exposeString('logo', { nullable: true }),
        sourceName: t.exposeString('sourceName'),
        sourceId: t.exposeInt('sourceId'),
    }),
});

builder.queryFields((t) => ({
    catalogCountries: t.field({
        type: [CatalogCountryRef],
        resolve: async () => {
            return repository.football.getCatalogCountries();
        },
    }),
    catalogLeagues: t.field({
        type: [CatalogLeagueRef],
        args: {
            countryId: t.arg.string({ required: true }),
        },
        resolve: async (_, { countryId }) => {
            return repository.football.getCatalogLeagues(countryId);
        },
    }),
}));

builder.mutationFields((t) => ({
    syncCatalog: t.field({
        type: builder.simpleObject('SyncCatalogResult', {
            fields: (t) => ({
                success: t.boolean(),
                processedCount: t.int(),
            }),
        }),
        resolve: async () => {
            let processedCount = 0;
            await JobRunner.run('sync-catalog', async () => {
                const res = await repository.football.syncCatalogLeagues();
                processedCount = res.stats.processedCount;
                return {
                    processedCount: res.stats.processedCount,
                    apiCallsCount: res.stats.apiCallsCount,
                };
            });
            return { success: true, processedCount };
        },
    }),
    promoteLeague: t.field({
        type: LeagueRef, // Reusing LeagueRef if possible
        args: {
            catalogId: t.arg.string({ required: true }),
        },
        resolve: async (_, { catalogId }) => {
            return repository.football.promoteLeague(catalogId);
        },
    }),
}));
