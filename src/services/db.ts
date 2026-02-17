import { db } from './dao/schema';
import type { Team, Fixture, StandingsRow, LeagueConfig, CacheEntry } from '../types';
import { calculateHash } from './idUtils';

// ─── Opinionated Database Interface ────────────────────────────────────────

/**
 * UltraTable Database - Domain-specific, opinionated data access layer
 * Hides implementation details and provides type-safe methods for all data operations
 */
export class UltraTableDatabase {
    // ─── Fixtures ──────────────────────────────────────────────────────────

    async getFixtures(leagueId: number, season: number): Promise<Fixture[] | null> {
        const key = `fixtures_${leagueId}_${season}`;
        const record = await db.cache.get(key);
        return record?.data || null;
    }

    async saveFixtures(leagueId: number, season: number, fixtures: Fixture[]): Promise<void> {
        const key = `fixtures_${leagueId}_${season}`;
        await db.cache.put({ key, data: fixtures, timestamp: Date.now() });
    }

    async getFixturesAge(leagueId: number, season: number): Promise<number | null> {
        const key = `fixtures_${leagueId}_${season}`;
        const record = await db.cache.get(key);
        return record ? Date.now() - record.timestamp : null;
    }

    // ─── Teams ─────────────────────────────────────────────────────────────

    async getTeams(leagueId: number, season: number): Promise<Team[] | null> {
        const key = `teams_${leagueId}_${season}`;
        const record = await db.cache.get(key);
        return record?.data || null;
    }

    async saveTeams(leagueId: number, season: number, teams: Team[]): Promise<void> {
        const key = `teams_${leagueId}_${season}`;
        await db.cache.put({ key, data: teams, timestamp: Date.now() });
    }

    // ─── Standings ─────────────────────────────────────────────────────────

    async getStandings(leagueId: number, season: number): Promise<StandingsRow[] | null> {
        const key = `standings_${leagueId}_${season}`;
        const record = await db.cache.get(key);
        return record?.data || null;
    }

    async saveStandings(leagueId: number, season: number, standings: StandingsRow[]): Promise<void> {
        const key = `standings_${leagueId}_${season}`;
        await db.cache.put({ key, data: standings, timestamp: Date.now() });
    }

    // ─── Graphics ──────────────────────────────────────────────────────────

    async getGraphicBlob(id: string): Promise<Blob | null> {
        const graphic = await db.graphics.get(id);
        if (!graphic || !graphic.blobHash) {
            // Fallback for legacy or unhashed
            const legacyRecord = await db.blobs.get(id);
            return legacyRecord?.blob || null;
        }
        const record = await db.blobs.get(graphic.blobHash);
        return record?.blob || null;
    }

    async getGraphicBlobUrl(id: string): Promise<string | null> {
        const blob = await this.getGraphicBlob(id);
        return blob ? URL.createObjectURL(blob) : null;
    }

    async saveGraphicBlob(id: string, blob: Blob): Promise<void> {
        // 1. Calculate content hash
        const hash = await calculateHash(blob);

        // 2. Store blob indexed by hash (deduplication)
        await db.blobs.put({
            id: hash,
            blob,
            timestamp: Date.now()
        });

        // 3. Link graphic record to this hash
        await db.graphics.where('id').equals(id).modify({ blobHash: hash });
    }

    async deleteGraphic(id: string): Promise<void> {
        // We delete the reference. The blob stays (garbage collection could be added later
        // by checking if any other graphic points to the same blobHash)
        await db.graphics.delete(id);
    }

    async clearAllGraphics(): Promise<void> {
        await db.blobs.clear();
        await db.graphics.clear();
    }

    // ─── API Quotas ────────────────────────────────────────────────────────

    async getQuotaStatus(endpoint: string): Promise<{ used: number; limit: number; remaining: number } | null> {
        const record = await db.quotas.get(endpoint);
        if (!record) return null;
        return {
            used: record.used,
            limit: record.limit,
            remaining: record.limit - record.used
        };
    }

    async incrementQuota(endpoint: string, dailyLimit: number): Promise<boolean> {
        const now = Date.now();
        const record = await db.quotas.get(endpoint);

        // Check if needs reset (new day)
        if (!record || now >= record.resetAt) {
            await db.quotas.put({
                key: endpoint,
                used: 1,
                limit: dailyLimit,
                resetAt: this.getNextResetTime(now)
            });
            return true;
        }

        // Check if quota exceeded
        if (record.used >= record.limit) {
            return false;
        }

        // Increment
        await db.quotas.put({
            ...record,
            used: record.used + 1
        });
        return true;
    }

    async resetQuota(endpoint: string): Promise<void> {
        await db.quotas.delete(endpoint);
    }

    private getNextResetTime(now: number): number {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }

    // ─── Leagues ───────────────────────────────────────────────────────────

    async getLeague(leagueId: number, season: number): Promise<LeagueConfig | null> {
        const key = `${leagueId}_${season}`;
        const record = await db.leagues.get(key);
        return record?.config || null;
    }

    async saveLeague(config: LeagueConfig): Promise<void> {
        const key = `${config.id}_${config.season}`;
        await db.leagues.put({
            key,
            id: config.id,
            name: config.name,
            season: config.season,
            config
        });
    }

    async deleteLeague(leagueId: number, season: number): Promise<void> {
        const key = `${leagueId}_${season}`;
        await db.leagues.delete(key);
    }

    async getAllLeagues(): Promise<Record<string, LeagueConfig>> {
        const records = await db.leagues.toArray();
        const result: Record<string, LeagueConfig> = {};
        for (const record of records) {
            result[record.key] = record.config;
        }
        return result;
    }

    // ─── Settings ──────────────────────────────────────────────────────────

    async getSettings(): Promise<any | null> {
        const record = await db.settings.get('settings');
        return record?.data || null;
    }

    async saveSettings(settings: any): Promise<void> {
        await db.settings.put({ key: 'settings', data: settings });
    }

    // ─── API Key ───────────────────────────────────────────────────────────

    async getApiKey(): Promise<string | null> {
        const record = await db.cache.get('api_key');
        return record?.data || null;
    }

    async saveApiKey(key: string): Promise<void> {
        await db.cache.put({ key: 'api_key', data: key, timestamp: Date.now() });
    }

    // ─── Active League ─────────────────────────────────────────────────────

    async getActiveLeague(): Promise<string | null> {
        const record = await db.cache.get('active_league');
        return record?.data || null;
    }

    async saveActiveLeague(leagueKey: string): Promise<void> {
        await db.cache.put({ key: 'active_league', data: leagueKey, timestamp: Date.now() });
    }

    // ─── Player Data ───────────────────────────────────────────────────────

    async getPlayerData(playerId: number): Promise<any | null> {
        const key = `player_${playerId}`;
        const record = await db.cache.get(key);
        return record?.data || null;
    }

    async savePlayerData(playerId: number, data: any): Promise<void> {
        const key = `player_${playerId}`;
        await db.cache.put({ key, data, timestamp: Date.now() });
    }

    // ─── Logs ──────────────────────────────────────────────────────────────

    async addLog(level: 'info' | 'warn' | 'error', message: string, context?: any): Promise<void> {
        await db.logs.add({ timestamp: Date.now(), level, message, context });
    }

    async getLogs(limit: number = 50): Promise<Array<{ timestamp: number; level: string; message: string; context?: any }>> {
        const records = await db.logs
            .orderBy('timestamp')
            .reverse()
            .limit(limit)
            .toArray();

        return records.map(r => ({
            timestamp: r.timestamp,
            level: r.level,
            message: r.message,
            context: r.context
        }));
    }

    async clearLogs(): Promise<void> {
        await db.logs.clear();
    }

    // ─── Generic Cache (for anything not covered above) ───────────────────

    async getCached<T>(key: string): Promise<CacheEntry<T> | null> {
        const record = await db.cache.get(key);
        if (!record) return null;
        return {
            key,
            data: record.data as T,
            timestamp: record.timestamp
        };
    }

    async saveCached<T>(key: string, data: T): Promise<void> {
        await db.cache.put({ key, data, timestamp: Date.now() });
    }

    async deleteCached(key: string): Promise<void> {
        await db.cache.delete(key);
    }

    async getCacheAge(key: string): Promise<number | null> {
        const record = await db.cache.get(key);
        return record ? Date.now() - record.timestamp : null;
    }

    // ─── Bulk Operations ───────────────────────────────────────────────────

    async clearAllCache(): Promise<void> {
        await db.cache.clear();
        await db.blobs.clear();
        await db.quotas.clear();
        await db.logs.clear();
    }

    async clearLeagueData(leagueId: number, season: number): Promise<void> {
        const prefix = `${leagueId}_${season}`;
        const keys = await db.cache.where('key').startsWith(prefix).primaryKeys();
        await db.cache.bulkDelete(keys);
    }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const database = new UltraTableDatabase();
