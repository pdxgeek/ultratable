import { builder, requireAdmin } from './builder';
import { repository } from '../repositories/postgres.repository';
import { cacheService } from '../services/cache.service';
import * as schema from '../db/schema';
import { JobRunner } from '../workers/runner';
import { LeagueRef, SeasonRef } from './football';
import { GraphQLError } from 'graphql';
import { SeasonConfigSchema } from './seasonConfig';

const CatalogCountryRef = builder.objectRef<typeof schema.catalogCountries.$inferSelect>('CatalogCountry');
const CatalogLeagueRef = builder.objectRef<typeof schema.catalogLeagues.$inferSelect>('CatalogLeague');
const CatalogSeasonRef = builder.simpleObject('CatalogSeason', {
    fields: (t) => ({
        year: t.int({ description: 'Calendar year of the season (e.g. 2025).' }),
        start: t.string({ nullable: true, description: 'ISO date string for the season start. Null if not reported.' }),
        end: t.string({ nullable: true, description: 'ISO date string for the season end. Null if not reported.' }),
        current: t.boolean({ description: 'Whether this is the current active season according to the upstream provider.' }),
    }),
});

builder.objectType(CatalogCountryRef, {
    fields: (t) => ({
        id: t.exposeString('id', { description: 'Unique internal UUID for this catalog country entry. Catalog countries are synced from API-Football and represent the full upstream country list.' }),
        name: t.exposeString('name', { description: 'Country name (e.g. "England").' }),
        code: t.exposeString('code', { nullable: true, description: 'Two-letter ISO country code (e.g. "GB"). Null for some territories.' }),
        flag: t.exposeString('flag', { nullable: true, description: 'URL to the country flag image. Null if unavailable.' }),
        sourceName: t.exposeString('sourceName', { description: 'Name of the upstream data provider (e.g. "api-football").' }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'ISO-8601 timestamp of the last update.' }),
    }),
});

builder.objectType(CatalogLeagueRef, {
    fields: (t) => ({
        id: t.exposeString('id', { description: 'Unique internal UUID for this catalog league entry. A catalog league becomes a promoted (managed) league once an admin activates it via the promoteLeague mutation.' }),
        countryId: t.exposeString('countryId', { description: 'UUID of the catalog country this league belongs to. Used to filter leagues by country in the admin catalog browser.' }),
        name: t.exposeString('name', { description: 'Display name of the catalog league.' }),
        type: t.exposeString('type', { nullable: true, description: 'League type (e.g. "League", "Cup"). Null if not categorized.' }),
        logo: t.exposeString('logo', { nullable: true, description: 'URL to the league logo from the upstream provider.' }),
        sourceName: t.exposeString('sourceName', { description: 'Name of the upstream data provider.' }),
        sourceId: t.exposeInt('sourceId', { description: 'External API-Football league identifier. Used to fetch season availability from the upstream provider via refreshCatalogSeasons.' }),
        seasons: t.field({
            description: 'Available seasons for this catalog league, as reported by the upstream provider.',
            type: [CatalogSeasonRef],
            resolve: (parent) => ((parent.metadata as Record<string, unknown>)?.seasons as Record<string, unknown>[]) || [],
        }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'ISO-8601 timestamp of the last update.' }),
    }),
});

builder.queryFields((t) => ({
    catalogCountries: t.field({
        description: 'Admin only. Returns all countries from the upstream catalog.',
        type: [CatalogCountryRef],
        resolve: async (_root, _args, ctx) => {
            requireAdmin(ctx);
            return repository.football.getCatalogCountries();
        },
    }),
    catalogLeagues: t.field({
        description: 'Admin only. Returns catalog leagues, optionally filtered by country or sourceId.',
        type: [CatalogLeagueRef],
        args: {
            countryId: t.arg.string({ required: false, description: 'Optional UUID of a catalog country. When provided, only returns leagues belonging to that country. Omit to return all catalog leagues.' }),
            sourceId: t.arg.int({ required: false, description: 'Optional external API-Football league ID. When provided, returns the specific catalog league matching this upstream identifier. Useful for resolving a managed league back to its catalog entry.' }),
        },
        resolve: async (_, { countryId, sourceId }, ctx) => {
            requireAdmin(ctx);
            return repository.football.getCatalogLeagues(countryId || undefined, sourceId || undefined);
        },
    }),
}));

builder.mutationFields((t) => ({
    syncCatalog: t.field({
        description: 'Admin only. Syncs the full league/country catalog from API-Football.',
        type: builder.simpleObject('SyncCatalogResult', {
            fields: (t) => ({
                success: t.boolean({ description: 'Whether the catalog sync completed without errors.' }),
                processedCount: t.int({ description: 'Number of leagues processed during the sync.' }),
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
            cacheService.invalidate('catalog:');
            return { success: true, processedCount };
        },
    }),
    syncCountryLeagues: t.field({
        description: 'Admin only. Pulls the league catalog for a single country from the upstream provider and upserts it into catalog_leagues.',
        type: [CatalogLeagueRef],
        args: {
            countryId: t.arg.string({ required: true, description: 'UUID of the catalog country whose leagues to fetch and persist.' }),
        },
        resolve: async (_, { countryId }, ctx) => {
            requireAdmin(ctx);
            await repository.football.syncCatalogLeagues(countryId);
            cacheService.invalidate('catalog:');
            return repository.football.getCatalogLeagues(countryId);
        },
    }),
    promoteLeague: t.field({
        description: 'Admin only. Promotes a catalog league into a managed (active) league, enabling season imports and fixture syncing.',
        type: LeagueRef, // Reusing LeagueRef if possible
        args: {
            catalogId: t.arg.string({ required: true, description: 'UUID of the catalog league to promote into a managed league. This copies the league into the active leagues table and enables season imports.' }),
        },
        resolve: async (_, { catalogId }, ctx) => {
            requireAdmin(ctx);
            const result = await repository.football.promoteLeague(catalogId);
            cacheService.invalidate('leagues');
            return result;
        },
    }),
    refreshCatalogSeasons: t.field({
        description: 'Admin only. Refreshes available seasons for a catalog league from the upstream API-Football provider.',
        type: CatalogLeagueRef,
        args: {
            catalogId: t.arg.string({ required: true, description: 'UUID of the catalog league whose available seasons to refresh from the upstream API-Football provider.' }),
        },
        resolve: async (_, { catalogId }, ctx) => {
            requireAdmin(ctx);
            const result = await repository.football.refreshCatalogSeasons(catalogId);
            cacheService.invalidate('catalog:');
            return result;
        },
    }),
    importSeason: t.field({
        description: 'Admin only. Creates a season record and triggers initial fixture and team sync from the external API.',
        type: SeasonRef,
        args: {
            leagueId: t.arg.string({ required: true, description: 'UUID of the promoted (managed) league to import a season for. The league must have already been promoted from the catalog.' }),
            year: t.arg.int({ required: true, description: 'Calendar year of the season to import (e.g. 2025). Creates a season record and triggers initial fixture and team sync from the external API.' }),
        },
        resolve: async (_, { leagueId, year }, ctx) => {
            requireAdmin(ctx);
            const result = await repository.football.importSeason(leagueId, year);
            cacheService.invalidate('seasons');
            cacheService.invalidate('leagues');
            return result;
        },
    }),
    removeSeason: t.field({
        description: 'Admin only. Permanently removes a season and cascades to delete all associated fixtures, team mappings, and standings data.',
        type: 'Boolean',
        args: {
            seasonId: t.arg.string({ required: true, description: 'UUID of the season to permanently remove. This cascades to delete all associated fixtures, team mappings, and standings data.' }),
        },
        resolve: async (_, { seasonId }, ctx) => {
            requireAdmin(ctx);
            const result = await repository.football.removeSeason(seasonId);
            cacheService.invalidate('seasons');
            cacheService.invalidate('leagues');
            cacheService.invalidate('fixtures');
            return result;
        },
    }),
    updateSeasonConfig: t.field({
        description: 'Admin only. Updates season configuration JSON (e.g. promotion zones, point deductions).',
        type: SeasonRef,
        args: {
            seasonId: t.arg.string({ required: true, description: 'UUID of the season whose configuration to update.' }),
            configJson: t.arg.string({ required: true, description: 'JSON string containing season configuration (e.g. promotion zones, deductions). Replaces the existing metadata entirely.' }),
        },
        resolve: async (_, { seasonId, configJson }, ctx) => {
            requireAdmin(ctx);
            let raw: unknown;
            try {
                raw = JSON.parse(configJson);
            } catch {
                throw new GraphQLError(`Invalid JSON in configJson: ${configJson.slice(0, 100)}`);
            }
            const parsed = SeasonConfigSchema.safeParse(raw);
            if (!parsed.success) {
                throw new GraphQLError('Invalid season config', {
                    extensions: {
                        code: 'BAD_USER_INPUT',
                        validationErrors: parsed.error.issues.map((i) => ({
                            path: i.path.join('.'),
                            message: i.message,
                        })),
                    },
                });
            }
            const result = await repository.football.updateSeasonConfig(seasonId, parsed.data);
            cacheService.invalidate('seasons');
            return result;
        },
    }),
}));
