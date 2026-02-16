import type {
    CacheDAO,
    BlobDAO,
    QuotaDAO,
    LeagueDAO,
    SettingsDAO,
    MockDataDAO,
    LogDAO,
    DataStore
} from './interface';
import { db } from './schema';

// ─── Cache DAO ─────────────────────────────────────────────────────────────

class DexieCacheDAO implements CacheDAO {
    async get(key: string) {
        const record = await db.cache.get(key);
        if (!record) return null;
        return { data: record.data, timestamp: record.timestamp };
    }

    async set(key: string, data: any) {
        await db.cache.put({
            key,
            data,
            timestamp: Date.now()
        });
    }

    async delete(key: string) {
        await db.cache.delete(key);
    }

    async getAge(key: string) {
        const record = await db.cache.get(key);
        if (!record) return null;
        return Date.now() - record.timestamp;
    }

    async clear(prefix?: string) {
        if (prefix) {
            const keys = await db.cache.where('key').startsWith(prefix).primaryKeys();
            await db.cache.bulkDelete(keys);
        } else {
            await db.cache.clear();
        }
    }
}

// ─── Blob DAO ──────────────────────────────────────────────────────────────

class DexieBlobDAO implements BlobDAO {
    async get(id: string) {
        const record = await db.blobs.get(id);
        return record?.blob || null;
    }

    async getBlobUrl(id: string) {
        const blob = await this.get(id);
        return blob ? URL.createObjectURL(blob) : null;
    }

    async set(id: string, blob: Blob) {
        await db.blobs.put({
            id,
            blob,
            timestamp: Date.now()
        });
    }

    async delete(id: string) {
        await db.blobs.delete(id);
    }

    async clear() {
        await db.blobs.clear();
    }
}

// ─── Quota DAO ─────────────────────────────────────────────────────────────

class DexieQuotaDAO implements QuotaDAO {
    async get(key: string) {
        const record = await db.quotas.get(key);
        if (!record) return null;
        return { used: record.used, limit: record.limit, resetAt: record.resetAt };
    }

    async increment(key: string, limit: number): Promise<boolean> {
        const now = Date.now();
        const record = await db.quotas.get(key);

        // Check if needs reset (new day)
        if (!record || now >= record.resetAt) {
            await db.quotas.put({
                key,
                used: 1,
                limit,
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

    async reset(key: string) {
        await db.quotas.delete(key);
    }

    private getNextResetTime(now: number): number {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }
}

// ─── League DAO ────────────────────────────────────────────────────────────

class DexieLeagueDAO implements LeagueDAO {
    async get(key: string) {
        const record = await db.leagues.get(key);
        return record?.config || null;
    }

    async set(key: string, config: any) {
        await db.leagues.put({
            key,
            id: config.id,
            name: config.name,
            season: config.season,
            config
        });
    }

    async delete(key: string) {
        await db.leagues.delete(key);
    }

    async list() {
        const records = await db.leagues.toArray();
        const result: Record<string, any> = {};
        for (const record of records) {
            result[record.key] = record.config;
        }
        return result;
    }
}

// ─── Settings DAO ──────────────────────────────────────────────────────────

class DexieSettingsDAO implements SettingsDAO {
    private readonly KEY = 'settings';

    async get() {
        const record = await db.settings.get(this.KEY);
        return record?.data || null;
    }

    async set(settings: any) {
        await db.settings.put({
            key: this.KEY,
            data: settings
        });
    }
}

// ─── Mock Data DAO ─────────────────────────────────────────────────────────

class DexieMockDataDAO implements MockDataDAO {
    async get(leagueId: number, key: string) {
        const record = await db.mockData.get([leagueId, key]);
        return record?.data || null;
    }

    async set(leagueId: number, key: string, data: any) {
        await db.mockData.put({
            key,
            leagueId,
            data
        });
    }

    async clear(leagueId?: number) {
        if (leagueId !== undefined) {
            await db.mockData.where('leagueId').equals(leagueId).delete();
        } else {
            await db.mockData.clear();
        }
    }
}

// ─── Log DAO ───────────────────────────────────────────────────────────────

class DexieLogDAO implements LogDAO {
    async add(level: 'info' | 'warn' | 'error', message: string, context?: any) {
        await db.logs.add({
            timestamp: Date.now(),
            level,
            message,
            context
        });
    }

    async list(limit: number = 50) {
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

    async clear() {
        await db.logs.clear();
    }
}

// ─── Data Store Implementation ────────────────────────────────────────────

export const dexieStore: DataStore = {
    cache: new DexieCacheDAO(),
    blobs: new DexieBlobDAO(),
    quotas: new DexieQuotaDAO(),
    leagues: new DexieLeagueDAO(),
    settings: new DexieSettingsDAO(),
    mockData: new DexieMockDataDAO(),
    logs: new DexieLogDAO()
};
