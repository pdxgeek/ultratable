import * as schema from '../db/schema';
import { SyncResult } from './shared';

export interface CatalogRepository {
    syncCatalogCountries(): Promise<SyncResult<typeof schema.catalogCountries.$inferSelect>>;
    syncCatalogLeagues(
        countryId?: string,
    ): Promise<SyncResult<typeof schema.catalogLeagues.$inferSelect>>;
    getCatalogCountries(): Promise<Array<typeof schema.catalogCountries.$inferSelect>>;
    getCatalogLeagues(
        countryId?: string,
        sourceId?: number,
    ): Promise<Array<typeof schema.catalogLeagues.$inferSelect>>;
    refreshCatalogSeasons(
        catalogLeagueId: string,
    ): Promise<typeof schema.catalogLeagues.$inferSelect>;
    promoteLeague(catalogLeagueId: string): Promise<typeof schema.leagues.$inferSelect>;
}
