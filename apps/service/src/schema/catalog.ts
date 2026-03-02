import { builder, requireAdmin } from './builder';
import { repository } from '../repositories/supabase.repository';
import * as schema from '../db/schema';
import { JobRunner } from '../workers/runner';
import { LeagueRef, SeasonRef } from './football';

const CatalogCountryRef = builder.objectRef<typeof schema.catalogCountries.$inferSelect>('CatalogCountry');
const CatalogLeagueRef = builder.objectRef<typeof schema.catalogLeagues.$inferSelect>('CatalogLeague');
const CatalogSeasonRef = builder.simpleObject('CatalogSeason', {
    fields: (t) => ({
        year: t.int(),
        start: t.string({ nullable: true }),
        end: t.string({ nullable: true }),
        current: t.boolean(),
    }),
});

builder.objectType(CatalogCountryRef, {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name'),
        code: t.exposeString('code', { nullable: true }),
        flag: t.exposeString('flag', { nullable: true }),
        sourceName: t.exposeString('sourceName'),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
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
        seasons: t.field({
            type: [CatalogSeasonRef],
            resolve: (parent) => ((parent.metadata as Record<string, unknown>)?.seasons as Record<string, unknown>[]) || [],
        }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
});

builder.queryFields((t) => ({
    catalogCountries: t.field({
        type: [CatalogCountryRef],
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            return repository.football.getCatalogCountries();
        },
    }),
    catalogLeagues: t.field({
        type: [CatalogLeagueRef],
        args: {
            countryId: t.arg.string({ required: false }),
            sourceId: t.arg.int({ required: false }),
        },
        resolve: async (_, { countryId, sourceId }, ctx) => {
            requireAdmin(ctx);
            return repository.football.getCatalogLeagues(countryId || undefined, sourceId || undefined);
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
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
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
        resolve: async (_, { catalogId }, ctx) => {
            requireAdmin(ctx);
            return repository.football.promoteLeague(catalogId);
        },
    }),
    refreshCatalogSeasons: t.field({
        type: CatalogLeagueRef,
        args: {
            catalogId: t.arg.string({ required: true }),
        },
        resolve: async (_, { catalogId }, ctx) => {
            requireAdmin(ctx);
            return repository.football.refreshCatalogSeasons(catalogId);
        },
    }),
    importSeason: t.field({
        type: SeasonRef,
        args: {
            leagueId: t.arg.string({ required: true }),
            year: t.arg.int({ required: true }),
        },
        resolve: async (_, { leagueId, year }, ctx) => {
            requireAdmin(ctx);
            return repository.football.importSeason(leagueId, year);
        },
    }),
    removeSeason: t.field({
        type: 'Boolean',
        args: {
            seasonId: t.arg.string({ required: true }),
        },
        resolve: async (_, { seasonId }, ctx) => {
            requireAdmin(ctx);
            return repository.football.removeSeason(seasonId);
        },
    }),
    updateSeasonConfig: t.field({
        type: SeasonRef,
        args: {
            seasonId: t.arg.string({ required: true }),
            configJson: t.arg.string({ required: true }),
        },
        resolve: async (_, { seasonId, configJson }, ctx) => {
            requireAdmin(ctx);
            const config = JSON.parse(configJson);
            return repository.football.updateSeasonConfig(seasonId, config);
        },
    }),
}));
