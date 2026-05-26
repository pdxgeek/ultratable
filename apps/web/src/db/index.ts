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

export interface PredictionDraft {
    // Composite key: `${userId}__${seasonId}__${type}`. Scopes drafts per
    // (user, season, prediction type) so signing in/out, switching seasons,
    // or adding new prediction types all stay cleanly separated.
    id: string;
    // Position-indexed slot array. `null` at index i means position (i+1)
    // is unfilled. Length equals the season's team count at the time the
    // draft was last saved — mismatched lengths are discarded on hydrate
    // (the season's team set changed under us).
    slots: (string | null)[];
    updatedAt: string;
}

// Per-fixture draft for the Gameweek-predictions editor (#144). One row per
// fixture the user is editing, scoped to (user, season, gameweek, fixture).
// Stays in Dexie until the user hits the row's Lock button — committing the
// pick to the server clears the draft.
//
// Why per-fixture and not a single blob per slip? Each row has its own lock
// action, so each row's "in-progress / unsaved" state is independent. A blob
// would force us to re-write the whole thing on every keystroke and would
// fight with concurrent rows.
export interface GameweekPredictionDraft {
    // Composite key: `${userId}__${seasonId}__${gameweek}__${fixtureId}`.
    id: string;
    userId: string;
    seasonId: string;
    gameweek: number;
    fixtureId: string;
    homeGoals: number | null;
    awayGoals: number | null;
    note: string | null;
    // Mirror of the eventual server-side `manuallyAdded` flag. Set when the
    // draft was created via the Add-fixture popup so the lock-in submit knows
    // to forward `manuallyAdded: true`.
    manuallyAdded: boolean;
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
    predictionDrafts!: Table<PredictionDraft, string>;
    gameweekPredictionDrafts!: Table<GameweekPredictionDraft, string>;

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
        this.version(3).stores({
            predictionDrafts: 'id, updatedAt',
        });
        // v4: gameweekPredictionDrafts — per-fixture drafts for #144 editor.
        // Compound index `[userId+seasonId+gameweek]` powers the "every draft
        // for this slip" lookup that hydrates the editor.
        this.version(4).stores({
            gameweekPredictionDrafts:
                'id, [userId+seasonId+gameweek], updatedAt',
        });
    }
}

export const db = new UltraWebDB();
