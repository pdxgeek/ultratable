import DataLoader from 'dataloader';

import * as schema from '../db/schema';
import { repository } from '../repositories';
import type { GameweekPredictionPickRow } from '../repositories/gameweek-predictions';
import type { PredictionSnapshotEntryRow } from '../repositories/predictions';
import type { TierRankableItemRow, TierRankableTypeRow } from '../repositories/tier-lists';

type Team = typeof schema.teams.$inferSelect;
type Venue = typeof schema.venues.$inferSelect;
type Season = typeof schema.seasons.$inferSelect;
type League = typeof schema.leagues.$inferSelect;
type Fixture = typeof schema.fixtures.$inferSelect;

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
        // Per-fixture resolution for `GameweekPredictionPick.fixture` and
        // any future field that wants a single fixture by UUID. No batched
        // repo method exists yet — a per-id Promise.all is fine at the
        // pick-count scale (~10 per slip) and trivially upgrades to a
        // batched repo method later without touching consumers.
        fixtureLoader: new DataLoader<string, Fixture | null>(async (ids) => {
            const rows = await Promise.all(
                ids.map((id) => repository.fixtures.getFixtureById(id)),
            );
            return rows;
        }),
        // Batches `GameweekPrediction.picks` (current view, one row per
        // fixture). Per-request, so no cross-request leak.
        gameweekPickCurrentLoader: new DataLoader<string, GameweekPredictionPickRow[]>(
            async (ids) => {
                const map =
                    await repository.gameweekPredictions.listCurrentPicksByPredictionIds(ids);
                return ids.map((id) => map.get(id) ?? []);
            },
        ),
        // Batches `GameweekPrediction.pickHistory` (every row, newest
        // first). Powers the per-fixture history popover in the UI.
        gameweekPickHistoryLoader: new DataLoader<string, GameweekPredictionPickRow[]>(
            async (ids) => {
                const map =
                    await repository.gameweekPredictions.listPickHistoryByPredictionIds(ids);
                return ids.map((id) => map.get(id) ?? []);
            },
        ),
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
