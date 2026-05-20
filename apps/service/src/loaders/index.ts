import DataLoader from 'dataloader';
import { inArray } from 'drizzle-orm';
import { db } from '../db';
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
            const rows = await db.select().from(schema.teams).where(inArray(schema.teams.id, [...ids]));
            return byId(rows, ids);
        }),
        venueLoader: new DataLoader<string, Venue | null>(async (ids) => {
            const rows = await db.select().from(schema.venues).where(inArray(schema.venues.id, [...ids]));
            return byId(rows, ids);
        }),
        seasonLoader: new DataLoader<string, Season | null>(async (ids) => {
            const rows = await db.select().from(schema.seasons).where(inArray(schema.seasons.id, [...ids]));
            return byId(rows, ids);
        }),
        leagueLoader: new DataLoader<string, League | null>(async (ids) => {
            const rows = await db.select().from(schema.leagues).where(inArray(schema.leagues.id, [...ids]));
            return byId(rows, ids);
        }),
    };
}

export type Loaders = ReturnType<typeof createLoaders>;
