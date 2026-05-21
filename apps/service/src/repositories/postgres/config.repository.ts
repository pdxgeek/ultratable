import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigRepository } from '../config';
import { globalLogger } from '../../services/log.service';

const logger = globalLogger.child({ module: 'repositories/config' });

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
        } catch (e: unknown) {
            logger.error({ error: (e as Error).message }, 'Failed to update DATABASE_URL in .env');
            return false;
        }
    }

    async updateApiFootballKey(key: string): Promise<boolean> {
        try {
            await this.updateEnvs({ 'API_FOOTBALL_KEY': key });
            return true;
        } catch (e: unknown) {
            logger.error({ error: (e as Error).message }, 'Failed to update API_FOOTBALL_KEY in .env');
            return false;
        }
    }

    async updateSupabaseConfig(url: string, anonKey: string): Promise<boolean> {
        try {
            await this.updateEnvs({
                'SUPABASE_URL': url,
                'SUPABASE_ANON_KEY': anonKey
            });
            return true;
        } catch (e: unknown) {
            logger.error({ error: (e as Error).message }, 'Failed to update Supabase config in .env');
            return false;
        }
    }
}
