import { eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import { IFootballProvider } from '../../integrations/types';
import { cacheService, TTL } from '../../services/cache.service';
import { graphicsService } from '../../services/graphics.service';
import { CatalogRepository } from '../catalog';
import { SyncResult } from '../shared';
import { DEFAULT_RANKING_CRITERIA } from './shared';

export class PostgresCatalogRepository implements CatalogRepository {
    constructor(private provider: IFootballProvider) {}

    async syncCatalogCountries(): Promise<SyncResult<typeof schema.catalogCountries.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        const ingested = await this.provider.getCountries();

        const toInsert = ingested.map((c) => ({
            name: c.name,
            code: c.code,
            flag: c.flag,
            sourceName: this.provider.name,
            updatedAt: new Date(),
        }));

        await db
            .insert(schema.catalogCountries)
            .values(toInsert)
            .onConflictDoUpdate({
                target: [schema.catalogCountries.sourceName, schema.catalogCountries.name],
                set: {
                    flag: sql`excluded.flag`,
                    updatedAt: new Date(),
                },
            });

        return {
            data: await this.getCatalogCountries(),
            stats: { processedCount: toInsert.length, apiCallsCount: 1 },
        };
    }

    async syncCatalogLeagues(
        countryId?: string,
    ): Promise<SyncResult<typeof schema.catalogLeagues.$inferSelect>> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };

        // Ensure countries exist first. Skipped when scoping to a single country — the caller already has it.
        let apiCallsCount = 1;
        if (!countryId) {
            await this.syncCatalogCountries();
            apiCallsCount = 2;
        }

        const localCountries = await this.getCatalogCountries();
        const countryMap = new Map<string, string>(
            localCountries.map((c) => [c.name as string, c.id as string]),
        );

        let scopedCountryName: string | undefined;
        if (countryId) {
            const country = localCountries.find((c) => c.id === countryId);
            if (!country) {
                throw new Error(`Catalog country not found: ${countryId}`);
            }
            scopedCountryName = country.name;
        }

        const ingested = await this.provider.getLeagues(scopedCountryName);

        const toInsert = ingested
            .map((item) => {
                const itemCountryId = countryMap.get(item.country || '');
                if (!itemCountryId) return null;

                return {
                    countryId: itemCountryId,
                    name: item.name,
                    type: 'league',
                    logo: item.logo,
                    sourceName: this.provider.name,
                    sourceId: item.sourceId,
                    metadata: {},
                    updatedAt: new Date(),
                };
            })
            .filter(Boolean);

        for (let i = 0; i < toInsert.length; i += 100) {
            const batch = toInsert.slice(i, i + 100);
            await db
                .insert(schema.catalogLeagues)
                .values(batch as unknown as (typeof schema.catalogLeagues.$inferInsert)[])
                .onConflictDoUpdate({
                    target: [schema.catalogLeagues.sourceName, schema.catalogLeagues.sourceId],
                    set: {
                        logo: sql`excluded.logo`,
                        metadata: sql`excluded.metadata`,
                        updatedAt: new Date(),
                    },
                });
        }

        return {
            data: [],
            stats: { processedCount: toInsert.length, apiCallsCount },
        };
    }

    async getCatalogCountries(): Promise<Array<typeof schema.catalogCountries.$inferSelect>> {
        if (!db) return [];
        const cached =
            cacheService.get<Array<typeof schema.catalogCountries.$inferSelect>>(
                'catalog:countries',
            );
        if (cached) return cached;

        const result = await db
            .select()
            .from(schema.catalogCountries)
            .orderBy(schema.catalogCountries.name);
        cacheService.set('catalog:countries', result, TTL.ACTIVE);
        return result;
    }

    async getCatalogLeagues(
        countryId?: string,
        sourceId?: number,
    ): Promise<Array<typeof schema.catalogLeagues.$inferSelect>> {
        if (!db) return [];
        const cacheKey = `catalog:leagues:${countryId || 'all'}:${sourceId || 'all'}`;
        const cached = cacheService.get<Array<typeof schema.catalogLeagues.$inferSelect>>(cacheKey);
        if (cached) return cached;

        const query = db.select().from(schema.catalogLeagues);
        let result: Array<typeof schema.catalogLeagues.$inferSelect>;
        if (countryId) {
            result = await query
                .where(eq(schema.catalogLeagues.countryId, countryId))
                .orderBy(schema.catalogLeagues.name);
        } else if (sourceId) {
            result = await query.where(eq(schema.catalogLeagues.sourceId, sourceId));
        } else {
            result = await query.orderBy(schema.catalogLeagues.name);
        }
        cacheService.set(cacheKey, result, TTL.ACTIVE);
        return result;
    }

    async refreshCatalogSeasons(
        catalogLeagueId: string,
    ): Promise<typeof schema.catalogLeagues.$inferSelect> {
        if (!db) return null as unknown as typeof schema.catalogLeagues.$inferSelect;

        const [catLeague] = await db
            .select()
            .from(schema.catalogLeagues)
            .where(eq(schema.catalogLeagues.id, catalogLeagueId));
        if (!catLeague) throw new Error('Catalog league not found');

        const seasons = await this.provider.getSeasons(catLeague.sourceId);

        const [updated] = await db
            .update(schema.catalogLeagues)
            .set({
                metadata: { ...((catLeague.metadata as Record<string, unknown>) || {}), seasons },
                updatedAt: new Date(),
            })
            .where(eq(schema.catalogLeagues.id, catalogLeagueId))
            .returning();

        return updated;
    }

    async promoteLeague(catalogLeagueId: string): Promise<typeof schema.leagues.$inferSelect> {
        if (!db) return null as unknown as typeof schema.leagues.$inferSelect;

        const [catLeague] = await db
            .select()
            .from(schema.catalogLeagues)
            .where(eq(schema.catalogLeagues.id, catalogLeagueId));
        if (!catLeague) throw new Error('Catalog league not found');

        const [catCountry] = await db
            .select()
            .from(schema.catalogCountries)
            .where(eq(schema.catalogCountries.id, catLeague.countryId));

        const catMetadata = (catLeague.metadata as Record<string, unknown> | null) ?? {};
        const managedMetadata = { ...catMetadata, rankingCriteria: DEFAULT_RANKING_CRITERIA };
        const [managed] = await db
            .insert(schema.leagues)
            .values({
                name: catLeague.name,
                slug: catLeague.name.toLowerCase().replace(/ /g, '-'),
                country: catCountry?.name,
                logo: catLeague.logo,
                sourceName: catLeague.sourceName,
                sourceId: catLeague.sourceId,
                metadata: managedMetadata,
            })
            .onConflictDoUpdate({
                target: [schema.leagues.sourceName, schema.leagues.sourceId],
                set: { updatedAt: new Date() },
            })
            .returning();

        if (managed.logo) {
            graphicsService.sideload(managed.id, 'league', managed.logo);
        }

        return managed;
    }
}
