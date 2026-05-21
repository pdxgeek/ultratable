import type { Table } from 'dexie';

import Dexie from 'dexie';

export interface SyncState {
    key: string; // e.g., "teams:39:2024" or "fixtures:39:2024"
    lastUpdatedAt: string;
    metadata?: Record<string, unknown>;
}

export interface League {
    id: string;
    sourceId: number;
    name: string;
    country?: string;
    countryFlag?: string;
    logo?: string;
    slug: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
}

export interface Season {
    id: string;
    leagueId: string;
    sourceId?: number; // Optional as backend might only provide it via league parent
    year: number;
    updatedAt: string;
    rankingCriteria?: unknown[];
    metadata?: Record<string, unknown>;
}

export interface Team {
    id: string;
    name: string;
    shortName?: string;
    tla?: string;
    logo?: string;
    updatedAt: string;
}

export interface Fixture {
    id: string;
    seasonId: string;
    homeTeamId: string;
    awayTeamId: string;
    venueId?: string;
    scheduledAt: string;
    status: string;
    goalsHome: number | null;
    goalsAway: number | null;
    gameweek?: number | null;
    updatedAt: string;
}

export interface Venue {
    id: string;
    name: string;
    city?: string;
    image?: string;
    updatedAt: string;
}

export interface Graphic {
    id: string;
    entityType: string;
    entityId: string;
    variantName: string;
    blobPath: string;
    url: string;
    updatedAt: string;
}

export class UltraWebDB extends Dexie {
    syncState!: Table<SyncState, string>;
    leagues!: Table<League, string>;
    seasons!: Table<Season, string>;
    teams!: Table<Team, string>;
    fixtures!: Table<Fixture, string>;
    venues!: Table<Venue, string>;
    graphics!: Table<Graphic, string>;

    constructor() {
        super('UltraWebDB');
        this.version(1).stores({
            syncState: 'key',
            leagues: 'id, sourceId, slug, updatedAt',
            seasons: 'id, leagueId, [leagueId+year], updatedAt',
            teams: 'id, updatedAt',
            fixtures: 'id, seasonId, scheduledAt, gameweek, updatedAt',
            graphics: 'id, [entityType+entityId], updatedAt',
        });
        this.version(2).stores({
            venues: 'id, updatedAt',
        });
    }
}

export const db = new UltraWebDB();
