import { ConfigRepository, FootballRepository, IRepository } from './interfaces';
import { db, supabase } from '../db';
import * as schema from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';

export class SupabaseConfigRepository implements ConfigRepository {
    private async updateEnvs(updates: Record<string, string>) {
        const envPath = path.resolve(process.cwd(), '.env');
        let content = '';
        try {
            content = await fs.readFile(envPath, 'utf-8');
        } catch { }

        let lines = content.split('\n');
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

export class SupabaseFootballRepository implements FootballRepository {
    private async getClient() {
        const apiKey = process.env.API_FOOTBALL_KEY;
        if (!apiKey) throw new Error('API-Football Key not configured');
        return axios.create({
            baseURL: 'https://v3.football.api-sports.io',
            headers: {
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
    }

    async getLeagues(): Promise<any[]> {
        if (!db) return [];
        const existing = await db.select().from(schema.leagues);
        if (existing.length > 0) return existing;

        const client = await this.getClient();
        const resp = await client.get('/leagues');
        const externalLeagues = resp.data.response;

        // Simplified mapping for the initial sync
        const leaguesToInsert = externalLeagues.map((item: any) => ({
            name: item.league.name,
            slug: item.league.name.toLowerCase().replace(/\s+/g, '-'),
            country: item.country.name,
            logo: item.league.logo,
            metadata: { apiFootballId: item.league.id }
        }));

        // Upsert into Drizzle
        await db.insert(schema.leagues).values(leaguesToInsert).onConflictDoNothing();
        return db.select().from(schema.leagues);
    }

    async getTeams(leagueId: number, season: number): Promise<any[]> {
        if (!db) return [];
        const client = await this.getClient();
        const resp = await client.get('/teams', {
            params: { league: leagueId, season }
        });

        const externalTeams = resp.data.response;
        const teamsToInsert = externalTeams.map((item: any) => ({
            name: item.team.name,
            shortName: item.team.name,
            tla: item.team.code,
            logo: item.team.logo,
            venue: item.venue.name,
            metadata: { apiFootballId: item.team.id }
        }));

        await db.insert(schema.teams).values(teamsToInsert).onConflictDoNothing();
        return db.select().from(schema.teams);
    }
}

export const repository: IRepository = {
    config: new SupabaseConfigRepository(),
    football: new SupabaseFootballRepository(),
};
