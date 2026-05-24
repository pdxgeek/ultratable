import DataLoader from 'dataloader';

import * as schema from '../db/schema';
import { repository } from '../repositories';
import type { PredictionSnapshotEntryRow } from '../repositories/predictions';
import type { TierRankableItemRow, TierRankableTypeRow } from '../repositories/tier-lists';

type Team = typeof schema.teams.$inferSelect;
type Venue = typeof schema.venues.$inferSelect;
type Season = typeof schema.seasons.$inferSelect;
type League = typeof schema.leagues.$inferSelect;

function byId<T extends { id: string }>(rows: T[], ids: readonly string[]): (T | null)[] {
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
}

export function createLoaders() {
    return {
        teamLoader: new DataLoader<string, Team | null>(async (ids) => {
            const rows = await repository.teams.getTeamsByIds(ids);
            return byId(rows, ids);
        }),
        venueLoader: new DataLoader<string, Venue | null>(async (ids) => {
            const rows = await repository.teams.getVenuesByIds(ids);
            return byId(rows, ids);
        }),
        seasonLoader: new DataLoader<string, Season | null>(async (ids) => {
            const rows = await repository.leagues.getSeasonsByIds(ids);
            return byId(rows, ids);
        }),
        leagueLoader: new DataLoader<string, League | null>(async (ids) => {
            const rows = await repository.leagues.getLeaguesByIds(ids);
            return byId(rows, ids);
        }),
        // Batches `PredictionSnapshot.entries` so listing N snapshots issues
        // one entry-fetch instead of N. Per-request, so no cross-request leak.
        predictionEntriesLoader: new DataLoader<string, PredictionSnapshotEntryRow[]>(
            async (ids) => {
                const map = await repository.predictions.listSnapshotEntriesByIds(ids);
                return ids.map((id) => map.get(id) ?? []);
            },
        ),
        // Batches `TierList.items` so listing N tier lists in one query
        // issues one item-fetch instead of N. Live items only — the
        // repository filters `deletedAt IS NULL`.
        tierRankableItemsLoader: new DataLoader<string, TierRankableItemRow[]>(
            async (ids) => {
                const map = await repository.tierLists.listItemsByTierListIds(ids);
                return ids.map((id) => map.get(id) ?? []);
            },
        ),
        // Batches `TierRankableItem.tierRankableType` (and `TierList.tierRankableType`)
        // — every item / tier list resolves its recipe row for display name +
        // formula seam. With ~3 recipe rows total the data is small, but the
        // loader still saves N+1 round-trips when the editor query touches
        // dozens of items.
        tierRankableTypeLoader: new DataLoader<string, TierRankableTypeRow | null>(
            async (ids) => {
                const rows = await Promise.all(
                    ids.map((id) => repository.tierLists.getTierRankableTypeById(id)),
                );
                return rows;
            },
        ),
    };
}

export type Loaders = ReturnType<typeof createLoaders>;
