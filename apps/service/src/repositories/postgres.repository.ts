import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import fs from 'node:fs/promises';
import path from 'node:path';
import { IFootballProvider } from '../integrations/types';
import { ApiFootballProvider } from '../integrations/api-football';
import {
    CatalogRepository,
    ConfigRepository,
    FixturesRepository,
    FootballRepository,
    GraphicsRepository,
    IRepository,
    LeaguesRepository,
    PlayersRepository,
    TeamsRepository,
    WorkersRepository,
} from './interfaces';
import { PostgresLeaguesRepository } from './football/leagues.repository';
import { PostgresTeamsRepository } from './football/teams.repository';
import { PostgresFixturesRepository } from './football/fixtures.repository';
import { PostgresCatalogRepository } from './football/catalog.repository';
import { PostgresPlayersRepository } from './football/players.repository';
import { PostgresGraphicsRepository } from './football/graphics.repository';

export class PostgresConfigRepository implements ConfigRepository {
    private async updateEnvs(updates: Record<string, string>) {
        // In production, the filesystem is ephemeral (Docker/Fly.io) — .env changes would be lost on redeploy.
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Config mutations are disabled in production. Use environment variables instead.');
        }
        const envPath = path.resolve(process.cwd(), '.env');
        let content = '';
        try {
            content = await fs.readFile(envPath, 'utf-8');
        } catch {
            // ignore if .env is missing
        }

        const lines = content.split('\n');
        for (const [key, value] of Object.entries(updates)) {
            const index = lines.findIndex(l => l.startsWith(`${key}=`));
            if (index !== -1) {
                lines[index] = `${key}=${value}`;
            } else {
                lines.push(`${key}=${value}`);
            }
        }

        await fs.writeFile(envPath, lines.join('\n').trim());
    }

    async getDatabaseUrlMasked(): Promise<string | null> {
        const url = process.env.DATABASE_URL;
        if (!url || url.includes('[HOST]')) return null;
        const host = url.split('@')[1] || url;
        return `postgresql://****@${host}`;
    }

    async getApiFootballKeyMasked(): Promise<string | null> {
        const key = process.env.API_FOOTBALL_KEY;
        if (!key || key.includes('[YOUR_KEY]')) return null;
        return `${key.slice(0, 4)}****${key.slice(-4)}`;
    }

    async getSupabaseUrl(): Promise<string | null> {
        return process.env.SUPABASE_URL || null;
    }

    async getSupabaseAnonKeyMasked(): Promise<string | null> {
        const key = process.env.SUPABASE_ANON_KEY;
        if (!key || key.includes('[ANON_KEY]')) return null;
        return `${key.slice(0, 4)}****${key.slice(-4)}`;
    }

    async updateDatabaseUrl(url: string): Promise<boolean> {
        try {
            await this.updateEnvs({ 'DATABASE_URL': url });
            return true;
        } catch { return false; }
    }

    async updateApiFootballKey(key: string): Promise<boolean> {
        try {
            await this.updateEnvs({ 'API_FOOTBALL_KEY': key });
            return true;
        } catch { return false; }
    }

    async updateSupabaseConfig(url: string, anonKey: string): Promise<boolean> {
        try {
            await this.updateEnvs({
                'SUPABASE_URL': url,
                'SUPABASE_ANON_KEY': anonKey
            });
            return true;
        } catch { return false; }
    }
}

/**
 * Composed football facade. Sub-repos are constructed once and share a single
 * provider instance, mirroring the pre-split class which carried one provider
 * for every operation.
 */
export class PostgresFootballRepository implements FootballRepository {
    readonly leagues: LeaguesRepository;
    readonly teams: TeamsRepository;
    readonly fixtures: FixturesRepository;
    readonly catalog: CatalogRepository;
    readonly players: PlayersRepository;
    readonly graphics: GraphicsRepository;

    constructor(providerOverride?: IFootballProvider) {
        const provider: IFootballProvider = providerOverride ?? new ApiFootballProvider();
        this.leagues = new PostgresLeaguesRepository(provider);
        this.teams = new PostgresTeamsRepository(provider);
        this.fixtures = new PostgresFixturesRepository(provider, this.teams);
        this.catalog = new PostgresCatalogRepository(provider);
        this.players = new PostgresPlayersRepository(provider);
        this.graphics = new PostgresGraphicsRepository();
    }
}

export class PostgresWorkersRepository implements WorkersRepository {
    async listJobs(): Promise<Array<typeof schema.jobs.$inferSelect>> {
        if (!db) return [];
        return db.select().from(schema.jobs).orderBy(schema.jobs.name);
    }

    async getJobByName(name: string): Promise<typeof schema.jobs.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.name, name));
        return row ?? null;
    }

    async listJobExecutions(jobId: string | null, limit: number): Promise<Array<typeof schema.jobExecutions.$inferSelect>> {
        if (!db) return [];
        const base = db.select().from(schema.jobExecutions).orderBy(desc(schema.jobExecutions.startedAt));
        if (jobId) {
            return db.select().from(schema.jobExecutions)
                .where(eq(schema.jobExecutions.jobId, jobId))
                .orderBy(desc(schema.jobExecutions.startedAt))
                .limit(limit);
        }
        return base.limit(limit);
    }

    async getLatestJobExecution(jobId: string): Promise<typeof schema.jobExecutions.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.jobExecutions)
            .where(eq(schema.jobExecutions.jobId, jobId))
            .orderBy(desc(schema.jobExecutions.startedAt))
            .limit(1);
        return row ?? null;
    }

    async listSystemLogs(limit: number): Promise<Array<typeof schema.systemLogs.$inferSelect>> {
        if (!db) return [];
        return db.select().from(schema.systemLogs)
            .orderBy(desc(schema.systemLogs.createdAt))
            .limit(limit);
    }
}

export const repository: IRepository = {
    config: new PostgresConfigRepository(),
    football: new PostgresFootballRepository(),
    workers: new PostgresWorkersRepository(),
};
