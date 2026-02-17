import Dexie, { type Table } from 'dexie';
import type { IntegrationReference } from '../../types';

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
    associationId: string;   // e.g., NanoID of the team/player
    blobHash?: string;       // SHA-256 hash of the content (for deduplication)
    externalReferences: IntegrationReference[];
    commonName: string;      // Human-readable name
    sourceUrl: string;       // Original URL
    timestamp: number;       // When registered
    lastRefreshed?: string;  // ISO UTC timestamp
}

// ─── User & Auth Records ───────────────────────────────────────────────────

export interface UserRecord {
    id: string;              // Primary key (NanoID) - UltraTable user ID
    email?: string;          // Primary email
    displayName?: string;    // User's chosen display name
    avatar?: string;         // Profile picture URL
    role: 'admin' | 'guest'; // User's role
    createdAt: number;
    lastLogin: number;
}

export interface OAuthConnectionRecord {
    id: string;              // Primary key (NanoID)
    userId: string;          // Links to UserRecord.id
    provider: 'github' | 'google' | 'discord';
    providerId: string;      // OAuth provider's user ID
    providerEmail?: string;  // Email from this provider
    providerUsername?: string; // Username from this provider
    accessToken?: string;    // Encrypted token (optional for client-side)
    refreshToken?: string;   // Encrypted refresh token
    tokenExpiry?: number;    // Token expiration timestamp
    scopes?: string[];       // OAuth scopes granted
    connectedAt: number;     // When linked
    lastUsed: number;        // Last auth with this provider
}

// ─── Prediction Records ────────────────────────────────────────────────────

export interface PredictorProfileRecord {
    id: string;              // Primary key (NanoID)
    userId?: string;         // Optional - links to user if logged in
    displayName: string;     // Public display name
    slug: string;            // URL-friendly name
    avatar?: string;         // Profile picture
    bio?: string;            // Profile description
    stats: {
        totalPredictions: number;
        exactScores: number;
        correctOutcomes: number;
        wrongPredictions: number;
        points: number;
        accuracy: number;    // Percentage
        currentStreak: number;
        bestStreak: number;
    };
    socialLinks?: string;    // JSON string of social links
    isPublic: boolean;       // Show on leaderboards
    createdAt: number;
    updatedAt: number;
}

export interface PredictionRecord {
    id: string;              // Primary key (NanoID)
    profileId: string;       // Links to PredictorProfileRecord.id
    fixtureId: string;       // Which match
    leagueId: number;        // Which league
    season: number;          // Which season
    homeScore: number;       // Predicted home score
    awayScore: number;       // Predicted away score
    confidence?: number;     // 1-5 rating
    notes?: string;          // Prediction notes
    isLocked: boolean;       // True after kickoff
    lockedAt?: number;       // Timestamp when locked
    result?: {               // Filled in after match
        actualHomeScore: number;
        actualAwayScore: number;
        points: number;      // 0, 1, or 3
        type: 'exact' | 'outcome' | 'wrong';
    };
    createdAt: number;
    updatedAt: number;
}

export interface MappingRecord {
    key: string;          // Primary key: "{provider}:{type}:{externalId}"
    internalId: string;   // NanoID
    externalId: string;   // Original ID from provider
    type: string;         // 'team', 'fixture', etc.
    provider: string;     // 'api-football', etc.
    timestamp: number;
}

// ─── Domain Entity Records ─────────────────────────────────────────────────

export interface TeamRecord {
    id: string;              // Primary key (NanoID)
    referenceKeys: string[]; // ['api-football:123', 'mock:456']
    data: any;               // Full Team object
    updatedAt: number;
}

export interface FixtureRecord {
    id: string;              // Primary key (NanoID)
    referenceKeys: string[]; // ['api-football:fixture:33']
    data: any;               // Full Fixture object
    updatedAt: number;
}

export interface PlayerRecord {
    id: string;              // Primary key (NanoID)
    referenceKeys: string[]; // ['api-football:player:123']
    data: any;               // Full Player object
    updatedAt: number;
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
    users!: Table<UserRecord, string>;
    oauthConnections!: Table<OAuthConnectionRecord, string>;
    predictorProfiles!: Table<PredictorProfileRecord, string>;
    predictions!: Table<PredictionRecord, string>;
    mappings!: Table<MappingRecord, string>;

    // Domain Store (v7)
    teams!: Table<TeamRecord, string>;
    fixtures!: Table<FixtureRecord, string>;
    players!: Table<PlayerRecord, string>;

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

        // Add user, auth, and prediction tables in version 3
        this.version(3).stores({
            cache: 'key, timestamp',
            blobs: 'id, timestamp',
            quotas: 'key, resetAt',
            leagues: 'key, id, season',
            settings: 'key',
            mockData: '[leagueId+key], leagueId',
            logs: '++id, timestamp, level',
            graphics: 'id, type, associationId, timestamp',
            users: 'id, email, lastLogin',
            oauthConnections: 'id, userId, [provider+providerId], lastUsed',
            predictorProfiles: 'id, userId, slug, isPublic, createdAt',
            predictions: 'id, profileId, fixtureId, [leagueId+season], isLocked, createdAt',
        });

        // Add roles in version 4
        this.version(4).stores({
            cache: 'key, timestamp',
            blobs: 'id, timestamp',
            quotas: 'key, resetAt',
            leagues: 'key, id, season',
            settings: 'key',
            mockData: '[leagueId+key], leagueId',
            logs: '++id, timestamp, level',
            graphics: 'id, type, associationId, timestamp',
            users: 'id, email, lastLogin, role',
            oauthConnections: 'id, userId, [provider+providerId], lastUsed',
            predictorProfiles: 'id, userId, slug, isPublic, createdAt',
            predictions: 'id, profileId, fixtureId, [leagueId+season], isLocked, createdAt',
        });

        // Mapping migration in version 5
        this.version(5).stores({
            cache: 'key, timestamp',
            blobs: 'id, timestamp',
            quotas: 'key, resetAt',
            leagues: 'key, id, season',
            settings: 'key',
            mockData: '[leagueId+key], leagueId',
            logs: '++id, timestamp, level',
            graphics: 'id, type, associationId, timestamp',
            users: 'id, email, lastLogin, role',
            oauthConnections: 'id, userId, [provider+providerId], lastUsed',
            predictorProfiles: 'id, userId, slug, isPublic, createdAt',
            predictions: 'id, profileId, fixtureId, [leagueId+season], isLocked, createdAt',
        });

        // ID Persistence in version 6
        this.version(6).stores({
            cache: 'key, timestamp',
            blobs: 'id, timestamp',
            quotas: 'key, resetAt',
            leagues: 'key, id, season',
            settings: 'key',
            mockData: '[leagueId+key], leagueId',
            logs: '++id, timestamp, level',
            graphics: 'id, type, associationId, timestamp',
            users: 'id, email, lastLogin, role',
            oauthConnections: 'id, userId, [provider+providerId], lastUsed',
            predictorProfiles: 'id, userId, slug, isPublic, createdAt',
            predictions: 'id, profileId, fixtureId, [leagueId+season], isLocked, createdAt',
            mappings: 'key, internalId, [provider+type+externalId]',
        });

        // Domain Store in version 7
        this.version(7).stores({
            cache: 'key, timestamp',
            blobs: 'id, timestamp',
            quotas: 'key, resetAt',
            leagues: 'key, id, season',
            settings: 'key',
            mockData: '[leagueId+key], leagueId',
            logs: '++id, timestamp, level',
            graphics: 'id, type, associationId, timestamp',
            users: 'id, email, lastLogin, role',
            oauthConnections: 'id, userId, [provider+providerId], lastUsed',
            predictorProfiles: 'id, userId, slug, isPublic, createdAt',
            predictions: 'id, profileId, fixtureId, [leagueId+season], isLocked, createdAt',
            mappings: 'key, internalId, [provider+type+externalId]',
            // Domain Tables
            teams: 'id, *referenceKeys',
            fixtures: 'id, *referenceKeys',
            players: 'id, *referenceKeys',
        });

        // Version 8: Binary Deduplication & Multi-Photo support
        this.version(8).stores({
            cache: 'key, timestamp',
            blobs: 'id, timestamp',
            quotas: 'key, resetAt',
            leagues: 'key, id, season',
            settings: 'key',
            mockData: '[leagueId+key], leagueId',
            logs: '++id, timestamp, level',
            graphics: 'id, type, associationId, blobHash, timestamp',
            users: 'id, email, lastLogin, role',
            oauthConnections: 'id, userId, [provider+providerId], lastUsed',
            predictorProfiles: 'id, userId, slug, isPublic, createdAt',
            predictions: 'id, profileId, fixtureId, [leagueId+season], isLocked, createdAt',
            mappings: 'key, internalId, [provider+type+externalId]',
            teams: 'id, *referenceKeys',
            fixtures: 'id, *referenceKeys',
            players: 'id, *referenceKeys',
        }).upgrade(async (tx) => {
            // Migration: Re-index blobs by hash and link graphics
            const graphics = await tx.table('graphics').toArray();
            const blobs = await tx.table('blobs').toArray();

            const blobMap = new Map(blobs.map(b => [b.id, b.blob]));

            // Note: In an upgrade hook, we can't easily use async calculateHash 
            // from idUtils because of transaction constraints and bundle issues.
            // However, Dexie's upgrade is async. We'll use a local simple hash for migration
            // or perform a 2-step migration if SHA-256 is slow. 
            // For now, let's assume we can use subtle crypto here.

            for (const graphic of graphics) {
                const blob = blobMap.get(graphic.id);
                if (blob) {
                    try {
                        const buffer = await blob.arrayBuffer();
                        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                        const hashArray = Array.from(new Uint8Array(hashBuffer));
                        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                        // Update graphic to point to hash
                        await tx.table('graphics').where('id').equals(graphic.id).modify({ blobHash: hash });

                        // Ensure blob exists under hash key
                        await tx.table('blobs').put({
                            id: hash,
                            blob: blob,
                            timestamp: Date.now()
                        });

                        // Delete old blob if it was keyed by graphic ID
                        if (graphic.id !== hash) {
                            await tx.table('blobs').delete(graphic.id);
                        }
                    } catch (e) {
                        console.warn(`Failed to migrate graphic ${graphic.id}:`, e);
                    }
                }
            }
        });
    }
}

// Singleton instance
export const db = new UltraTableDB();
