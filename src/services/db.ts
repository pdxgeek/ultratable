import { db } from './dao/schema';
import { generateId } from './idUtils';
import { calculateHash } from './idUtils';
import type { TeamRecord } from './dao/schema';
import type { Team, Fixture, StandingsRow, LeagueConfig, CacheEntry, League, LeagueSeason } from '../types';

// ─── Opinionated Database Interface ────────────────────────────────────────

/**
 * UltraTable Database - Domain-specific, opinionated data access layer
 * Hides implementation details and provides type-safe methods for all data operations
 */
export class UltraTableDatabase {
    private memoryCache = new Map<string, string>();

    // ─── ID Resolution (Consolidated from legacy idMap) ─────────────────────

    async getInternalId(
        provider: string,
        type: 'team' | 'fixture' | 'player' | 'league',
        externalId: string | number
    ): Promise<string> {
        const extIdStr = String(externalId);
        const referenceKey = `${provider}:${type}:${extIdStr}`;
        const memoryKey = `ref:${referenceKey}`;

        if (this.memoryCache.has(memoryKey)) return this.memoryCache.get(memoryKey)!;

        let id: string | undefined;

        // Query Domain Store by reference key
        if (type === 'team') {
            const record = await db.teams.where('referenceKeys').equals(referenceKey).first();
            if (record) id = record.id;
        } else if (type === 'fixture') {
            const record = await db.fixtures.where('referenceKeys').equals(referenceKey).first();
            if (record) id = record.id;
        } else if (type === 'player') {
            const record = await db.players.where('referenceKeys').equals(referenceKey).first();
            if (record) id = record.id;
        }

        // Fallback to legacy mappings table
        if (!id) {
            const legacyRecord = await db.mappings.get(referenceKey);
            if (legacyRecord) id = legacyRecord.internalId;
        }

        if (!id) {
            id = generateId();
            // Note: Persistence happens when the full entity is mapped and saved
        }

        this.memoryCache.set(memoryKey, id);
        return id;
    }

    async getExternalId(
        type: 'team' | 'fixture' | 'player' | 'league' | 'league_season',
        internalId: string,
        providerName: string
    ): Promise<string | null> {
        if (type === 'league') {
            const record = await db.leagues_v2.get(internalId);
            if (record?.data?.externalReferences) {
                const ref = record.data.externalReferences.find((r: any) => r.integrationName === providerName);
                return ref?.remoteId || null;
            }
            return null;
        }

        if (type === 'league_season') {
            const record = await db.league_seasons.get(internalId);
            if (record?.data?.externalReferences) {
                const ref = record.data.externalReferences.find((r: any) => r.integrationName === providerName);
                return ref?.remoteId || null;
            }
            return null;
        }

        let record: any;
        if (type === 'team') record = await db.teams.get(internalId);
        else if (type === 'fixture') record = await db.fixtures.get(internalId);
        else if (type === 'player') record = await db.players.get(internalId);

        if (!record || !record.referenceKeys) return null;

        const prefix = `${providerName}:${type}:`;
        const refKey = (record.referenceKeys as string[]).find(k => k.startsWith(prefix));
        return refKey ? refKey.split(':').pop() || null : null;
    }

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

    async getTeamsByIDs(ids: string[]): Promise<Team[]> {
        const records = await db.teams.bulkGet(ids);
        return records.filter((r): r is TeamRecord => !!r).map(r => r.data);
    }

    async getTeamsForSeason(seasonId: string): Promise<Team[]> {
        const season = await this.getLeagueSeasonById(seasonId);
        if (!season || !season.teamIds || season.teamIds.length === 0) return [];
        return this.getTeamsByIDs(season.teamIds);
    }

    async getTeamsForLeague(leagueId: string): Promise<Team[]> {
        const seasons = await this.getSeasonsForLeague(leagueId);
        const allTeamIds = new Set<string>();
        for (const s of seasons) {
            if (s.teamIds) {
                s.teamIds.forEach(id => allTeamIds.add(id));
            }
        }
        if (allTeamIds.size === 0) return [];
        return this.getTeamsByIDs(Array.from(allTeamIds));
    }

    async updateSeasonTeams(seasonId: string, teamIds: string[]): Promise<void> {
        const record = await db.league_seasons.get(seasonId);
        if (record) {
            record.data.teamIds = teamIds;
            await db.league_seasons.put(record);
        }
    }

    async repairTeamAssociations(): Promise<number> {
        const seasons = await this.getAllLeagueSeasons();
        let repairCount = 0;
        console.log(`[Repair] Total internal seasons found in DB: ${seasons.length}`);

        for (const seasonNano of seasons) {
            // 1. Resolve remote league API ID
            const leagueApiId = await this.getExternalId('league', seasonNano.leagueId, 'api-football');
            console.log(`[Repair] Processing Season NanoID: ${seasonNano.id} (League NanoID: ${seasonNano.leagueId}) -> API League ID: ${leagueApiId}`);

            if (!leagueApiId) {
                console.log(`[Repair] Skipping: No API ID mapping found for league ${seasonNano.leagueId}`);
                continue;
            }

            // 2. Try to find teams in cache
            const cacheKey = `teams_${leagueApiId}_${seasonNano.season}`;
            const cachedResult = await this.getCached<any[]>(cacheKey);

            if (!cachedResult) {
                console.log(`[Repair] No cache found for key: ${cacheKey}`);
                continue;
            }

            if (cachedResult.data && cachedResult.data.length > 0) {
                const participantNanoIds: string[] = [];

                for (const item of cachedResult.data) {
                    let teamApiId: string | null = null;

                    if (item.team?.id) {
                        teamApiId = String(item.team.id);
                    }
                    else if (item.externalReferences) {
                        const ref = item.externalReferences.find((r: any) => r.integrationName === 'api-football');
                        teamApiId = ref?.remoteId || null;
                    }

                    if (teamApiId) {
                        const teamNanoId = await this.getInternalId('api-football', 'team', teamApiId);
                        participantNanoIds.push(teamNanoId);
                    }
                }

                if (participantNanoIds.length > 0) {
                    console.log(`[Repair] SUCCESS: Linking ${participantNanoIds.length} teams to Season ${seasonNano.id}`);
                    await this.updateSeasonTeams(seasonNano.id, participantNanoIds);
                    repairCount++;
                }
            }
        }
        return repairCount;
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

    // ─── Leagues (V2 Hierarchical) ────────────────────────────────────────

    async getLeagueV2(id: string): Promise<League | null> {
        const record = await db.leagues_v2.get(id);
        return record?.data || null;
    }

    async saveLeagueV2(league: League): Promise<void> {
        await db.leagues_v2.put({
            id: league.id,
            commonName: league.commonName,
            data: league
        });
    }

    async getLeagueSeason(leagueId: string, season: number): Promise<LeagueSeason | null> {
        const record = await db.league_seasons
            .where('leagueId').equals(leagueId)
            .and(r => r.season === season)
            .first();
        return record?.data || null;
    }

    async getLeagueSeasonById(id: string): Promise<LeagueSeason | null> {
        const record = await db.league_seasons.get(id);
        return record?.data || null;
    }

    async saveLeagueSeason(season: LeagueSeason): Promise<void> {
        // Compound key would be better but for now use where/and
        const existing = await db.league_seasons
            .where('leagueId').equals(season.leagueId)
            .and(r => r.season === season.season)
            .first();

        await db.league_seasons.put({
            id: existing?.id || season.id,
            leagueId: season.leagueId,
            season: season.season,
            data: season
        });
    }

    async getAllLeaguesV2(): Promise<League[]> {
        const records = await db.leagues_v2.toArray();
        return records.map(r => r.data);
    }

    async getAllLeagueSeasons(): Promise<LeagueSeason[]> {
        const records = await db.league_seasons.toArray();
        return records.map(r => r.data);
    }

    async getSeasonsForLeague(leagueId: string): Promise<LeagueSeason[]> {
        const records = await db.league_seasons.where('leagueId').equals(leagueId).toArray();
        return records.map(r => r.data);
    }

    async deleteLeagueV2(id: string): Promise<void> {
        // 1. Delete all seasons for this league
        const seasons = await db.league_seasons.where('leagueId').equals(id).toArray();
        const seasonIds = seasons.map(s => s.id);
        await db.league_seasons.bulkDelete(seasonIds);

        // 2. Delete the league itself
        await db.leagues_v2.delete(id);
    }

    async deleteLeagueSeason(id: string): Promise<void> {
        await db.league_seasons.delete(id);
    }

    // ─── Legacy Leagues ────────────────────────────────────────────────────

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
        // Clear Private Mock Storage first
        try {
            const { clearMockData } = await import('./integrations/mock');
            clearMockData();
        } catch (e) {
            console.warn('Failed to clear mock data during purge:', e);
        }

        await db.cache.clear();
        await db.blobs.clear();
        await db.quotas.clear();
        await db.logs.clear();
        await db.leagues_v2.clear();
        await db.league_seasons.clear();
        await db.leagues.clear();
        await db.mockData.clear();
        await db.graphics.clear();
        await db.mappings.clear();
        await db.teams.clear();
        await db.fixtures.clear();
        await db.players.clear();
    }

    async clearLeagueData(leagueId: number, season: number): Promise<void> {
        const prefix = `${leagueId}_${season}`;
        const keys = await db.cache.where('key').startsWith(prefix).primaryKeys();
        await db.cache.bulkDelete(keys);
    }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const database = new UltraTableDatabase();
