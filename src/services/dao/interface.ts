// ─── Generic DAO Interface ─────────────────────────────────────────────────

export interface DAO<T> {
    get(key: string): Promise<T | null>;
    set(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    clear(prefix?: string): Promise<void>;
}

// ─── Specialized DAOs ──────────────────────────────────────────────────────

export interface CacheDAO<T = any> {
    get(key: string): Promise<{ data: T; timestamp: number } | null>;
    set(key: string, data: T): Promise<void>;
    delete(key: string): Promise<void>;
    getAge(key: string): Promise<number | null>;
    clear(prefix?: string): Promise<void>;
}

export interface BlobDAO {
    get(id: string): Promise<Blob | null>;
    getBlobUrl(id: string): Promise<string | null>;
    set(id: string, blob: Blob): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
}

export interface QuotaDAO {
    get(key: string): Promise<{ used: number; limit: number; resetAt: number } | null>;
    increment(key: string, limit: number): Promise<boolean>;
    reset(key: string): Promise<void>;
}

export interface LeagueDAO {
    get(key: string): Promise<any | null>;
    set(key: string, config: any): Promise<void>;
    delete(key: string): Promise<void>;
    list(): Promise<Record<string, any>>;
}

export interface SettingsDAO {
    get(): Promise<any | null>;
    set(settings: any): Promise<void>;
}

export interface MockDataDAO {
    get(leagueId: number, key: string): Promise<any | null>;
    set(leagueId: number, key: string, data: any): Promise<void>;
    clear(leagueId?: number): Promise<void>;
}

export interface LogDAO {
    add(level: 'info' | 'warn' | 'error', message: string, context?: any): Promise<void>;
    list(limit?: number): Promise<Array<{ timestamp: number; level: string; message: string; context?: any }>>;
    clear(): Promise<void>;
}

// ─── Combined Data Store Interface ────────────────────────────────────────

export interface DataStore {
    cache: CacheDAO;
    blobs: BlobDAO;
    quotas: QuotaDAO;
    leagues: LeagueDAO;
    settings: SettingsDAO;
    mockData: MockDataDAO;
    logs: LogDAO;
}
