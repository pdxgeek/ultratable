import DataLoader from 'dataloader';
import { repository } from '../repositories';
import * as schema from '../db/schema';

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
    };
}

export type Loaders = ReturnType<typeof createLoaders>;
