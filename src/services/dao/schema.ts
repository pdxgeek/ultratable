import Dexie, { type Table } from 'dexie';

// ─── Schema Interfaces ─────────────────────────────────────────────────────

export interface CacheRecord {
    key: string;           // Primary key
    data: any;            // JSON data
    timestamp: number;    // When cached
}

export interface BlobRecord {
    id: string;           // Primary key (graphic ID)
    blob: Blob;          // Binary data
    timestamp: number;   // When cached
}

export interface QuotaRecord {
    key: string;          // Primary key (e.g., 'api-football-players')
    used: number;
    limit: number;
    resetAt: number;      // Timestamp for daily reset
}

export interface LeagueRecord {
    key: string;          // Primary key (e.g., '39_2024')
    id: number;
    name: string;
    season: number;
    config: any;          // Full LeagueConfig object
}

export interface SettingRecord {
    key: string;          // Primary key (always 'settings')
    data: any;            // Settings object
}

export interface MockDataRecord {
    key: string;          // Primary key (e.g., 'teams', 'fixtures')
    leagueId: number;     // For filtering
    data: any;            // Mock data
}

export interface LogRecord {
    id?: number;          // Auto-increment
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
    context?: any;
}

export interface GraphicRecord {
    id: string;              // Primary key (graphic ID)
    type: string;            // 'team_logo', 'player_photo', 'venue_image', etc.
    associationId: string;   // e.g., 'team:33', 'player:api-football:306'
    integrationId: string;   // e.g., 'api-football:33'
    commonName: string;      // Human-readable name
    sourceUrl: string;       // Original URL
    timestamp: number;       // When registered
}

// ─── Database Definition ───────────────────────────────────────────────────

export class UltraTableDB extends Dexie {
    // Tables
    cache!: Table<CacheRecord, string>;
    blobs!: Table<BlobRecord, string>;
    quotas!: Table<QuotaRecord, string>;
    leagues!: Table<LeagueRecord, string>;
    settings!: Table<SettingRecord, string>;
    mockData!: Table<MockDataRecord, string>;
    logs!: Table<LogRecord, number>;
    graphics!: Table<GraphicRecord, string>;

    constructor() {
        super('ultratable');

        // Schema versioning
        this.version(1).stores({
            cache: 'key, timestamp',                    // Indexed by key, can query by timestamp
            blobs: 'id, timestamp',                     // Graphics stored by ID
            quotas: 'key, resetAt',                     // Quota tracking
            leagues: 'key, id, season',                 // League configs
            settings: 'key',                            // App settings (single record)
            mockData: '[leagueId+key], leagueId',      // Compound key for mock data
            logs: '++id, timestamp, level',             // Auto-increment ID
        });

        // Add graphics table in version 2
        this.version(2).stores({
            cache: 'key, timestamp',
            blobs: 'id, timestamp',
            quotas: 'key, resetAt',
            leagues: 'key, id, season',
            settings: 'key',
            mockData: '[leagueId+key], leagueId',
            logs: '++id, timestamp, level',
            graphics: 'id, type, associationId, timestamp',  // Graphics metadata
        });
    }
}

// Singleton instance
export const db = new UltraTableDB();
