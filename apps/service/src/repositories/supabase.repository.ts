import { ConfigRepository, FootballRepository, IRepository, SyncResult } from './interfaces';
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

import { Normalizer } from '../ingestion/normalizer';

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

        const leaguesToInsert = externalLeagues.map((item: any) => {
            const normalized = Normalizer.normalizeLeague(item, 'api-football');
            return {
                name: normalized.name,
                slug: normalized.slug,
                country: normalized.country,
                logo: normalized.logo,
                sourceName: normalized.sourceName,
                sourceId: normalized.sourceId,
                metadata: {}
            };
        });

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
        const teamsToInsert = externalTeams.map((item: any) => {
            const normalized = Normalizer.normalizeTeam(item, 'api-football');
            return {
                name: normalized.name,
                shortName: normalized.shortName,
                tla: normalized.tla,
                logo: normalized.logo,
                venue: normalized.venue,
                sourceName: normalized.sourceName,
                sourceId: normalized.sourceId,
                metadata: {}
            };
        });

        await db.insert(schema.teams).values(teamsToInsert).onConflictDoNothing();
        return db.select().from(schema.teams);
    }

    async syncSeasons(leagueId: number): Promise<SyncResult> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        let apiCallsCount = 0;
        const client = await this.getClient();
        const resp = await client.get('/leagues', { params: { id: leagueId } });
        apiCallsCount++;
        const leagueData = resp.data.response[0];
        if (!leagueData) return { data: [], stats: { processedCount: 0, apiCallsCount } };

        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
        if (!localLeague) throw new Error(`League with sourceId ${leagueId} not found locally.`);

        const seasonsToInsert = leagueData.seasons.map((s: any) => {
            const normalized = Normalizer.normalizeSeason(leagueData, s, 'api-football');
            return {
                leagueId: localLeague.id,
                year: normalized.year,
                startDate: normalized.startDate ? new Date(normalized.startDate) : null,
                endDate: normalized.endDate ? new Date(normalized.endDate) : null,
                metadata: {}
            };
        });

        await db.insert(schema.seasons).values(seasonsToInsert).onConflictDoNothing();
        const data = await db.select().from(schema.seasons).where(eq(schema.seasons.leagueId, localLeague.id));
        return {
            data,
            stats: {
                processedCount: seasonsToInsert.length,
                apiCallsCount
            }
        };
    }

    async syncFixtures(leagueId: number, seasonYear: number): Promise<SyncResult> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        let apiCallsCount = 0;

        // 1. Ensure season exists
        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
        if (!localLeague) throw new Error(`League ${leagueId} not found`);

        let [localSeason] = await db.select().from(schema.seasons)
            .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);

        if (!localSeason) {
            const syncRes = await this.syncSeasons(leagueId);
            apiCallsCount += syncRes.stats.apiCallsCount;
            [localSeason] = await db.select().from(schema.seasons)
                .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);
        }

        if (!localSeason) throw new Error(`Season ${seasonYear} not found for league ${leagueId}`);

        // 2. Ensure teams exist for this league/season
        const client = await this.getClient();
        let teams = await db.select().from(schema.teams);

        // If no teams found in DB at all, or we want to be safe, fetch them
        // In a production world, we might want to check if teams for THIS league exist
        // For now, let's just make sure we have the teams for this league first
        const leagueTeams = await this.getTeams(leagueId, seasonYear);
        apiCallsCount++;

        // Re-fetch all teams to get IDs
        teams = await db.select().from(schema.teams);
        const teamMap = new Map<number, string>(teams.map((t: any) => [t.sourceId, t.id]));

        // 3. Fetch fixtures
        const resp = await client.get('/fixtures', {
            params: { league: leagueId, season: seasonYear }
        });
        apiCallsCount++;
        const externalFixtures = resp.data.response;

        const fixturesToInsert = externalFixtures.map((item: any) => {
            const normalized = Normalizer.normalizeFixture(item, 'api-football');
            const homeId = teamMap.get(normalized.homeTeamSourceId);
            const awayId = teamMap.get(normalized.awayTeamSourceId);

            if (!homeId || !awayId) {
                return null;
            }

            return {
                sourceName: normalized.sourceName,
                sourceId: normalized.sourceId,
                leagueId: localLeague.id,
                seasonId: localSeason.id,
                homeTeamId: homeId,
                awayTeamId: awayId,
                scheduledAt: new Date(normalized.scheduledAt),
                status: normalized.status,
                goalsHome: normalized.homeGoals,
                goalsAway: normalized.awayGoals,
                metadata: {},
                updatedAt: new Date()
            };
        }).filter(Boolean);

        // 4. Batch upsert
        for (const fix of fixturesToInsert) {
            await db.insert(schema.fixtures)
                .values(fix as any)
                .onConflictDoUpdate({
                    target: [schema.fixtures.sourceName, schema.fixtures.sourceId],
                    set: {
                        status: fix.status,
                        goalsHome: fix.goalsHome,
                        goalsAway: fix.goalsAway,
                        updatedAt: new Date()
                    }
                });
        }

        const data = await this.getFixtures(leagueId, seasonYear);
        return {
            data,
            stats: {
                processedCount: fixturesToInsert.length,
                apiCallsCount
            }
        };
    }

    async getFixtures(leagueId: number, seasonYear: number, since?: Date): Promise<any[]> {
        if (!db) return [];
        const [localLeague] = await db.select().from(schema.leagues).where(eq(schema.leagues.sourceId, leagueId));
        if (!localLeague) return [];

        const [localSeason] = await db.select().from(schema.seasons)
            .where(sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`);
        if (!localSeason) return [];

        let query = db.select().from(schema.fixtures)
            .where(eq(schema.fixtures.seasonId, localSeason.id));

        if (since) {
            // Re-bind query with date filter
            query = db.select().from(schema.fixtures)
                .where(sql`${schema.fixtures.seasonId} = ${localSeason.id} AND ${schema.fixtures.updatedAt} > ${since}`);
        }

        return query;
    }

    // Catalog Management
    async syncCatalogCountries(): Promise<SyncResult> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        const client = await this.getClient();
        const resp = await client.get('/countries');
        const countries = resp.data.response;

        const toInsert = countries.map((c: any) => ({
            name: c.name,
            code: c.code,
            flag: c.flag,
            sourceName: 'api-football',
            updatedAt: new Date()
        }));

        await db.insert(schema.catalogCountries).values(toInsert).onConflictDoUpdate({
            target: [schema.catalogCountries.sourceName, schema.catalogCountries.name],
            set: {
                flag: sql`excluded.flag`,
                updatedAt: new Date()
            }
        });

        return {
            data: await this.getCatalogCountries(),
            stats: { processedCount: toInsert.length, apiCallsCount: 1 }
        };
    }

    async syncCatalogLeagues(): Promise<SyncResult> {
        if (!db) return { data: [], stats: { processedCount: 0, apiCallsCount: 0 } };
        const client = await this.getClient();
        const resp = await client.get('/leagues');
        const leagues = resp.data.response;

        // Ensure countries exist first
        await this.syncCatalogCountries();

        const localCountries = await this.getCatalogCountries();
        const countryMap = new Map<string, string>(localCountries.map(c => [c.name, c.id]));

        const toInsert = leagues.map((item: any) => {
            const countryId = countryMap.get(item.country.name);
            if (!countryId) return null;

            return {
                countryId,
                name: item.league.name,
                type: item.league.type,
                logo: item.league.logo,
                sourceName: 'api-football',
                sourceId: item.league.id,
                metadata: { seasons: item.seasons },
                updatedAt: new Date()
            };
        }).filter(Boolean);

        // Batch upsert catalog leagues
        for (let i = 0; i < toInsert.length; i += 100) {
            const batch = toInsert.slice(i, i + 100);
            await db.insert(schema.catalogLeagues).values(batch as any).onConflictDoUpdate({
                target: [schema.catalogLeagues.sourceName, schema.catalogLeagues.sourceId],
                set: {
                    logo: sql`excluded.logo`,
                    metadata: sql`excluded.metadata`,
                    updatedAt: new Date()
                }
            });
        }

        return {
            data: [],
            stats: { processedCount: toInsert.length, apiCallsCount: 2 } // countries + leagues
        };
    }

    async getCatalogCountries(): Promise<any[]> {
        if (!db) return [];
        return db.select().from(schema.catalogCountries).orderBy(schema.catalogCountries.name);
    }

    async getCatalogLeagues(countryId: string): Promise<any[]> {
        if (!db) return [];
        return db.select().from(schema.catalogLeagues)
            .where(eq(schema.catalogLeagues.countryId, countryId))
            .orderBy(schema.catalogLeagues.name);
    }

    async promoteLeague(catalogLeagueId: string): Promise<any> {
        if (!db) return null;

        const [catLeague] = await db.select().from(schema.catalogLeagues).where(eq(schema.catalogLeagues.id, catalogLeagueId));
        if (!catLeague) throw new Error('Catalog league not found');

        const [catCountry] = await db.select().from(schema.catalogCountries).where(eq(schema.catalogCountries.id, catLeague.countryId));

        // 1. Sideload Logo (In a real app we'd fetch and upload to Supabase Storage)
        // For now, we'll just use the external URL but we've planned for storage
        const logoUrl = catLeague.logo;

        // 2. Insert into managed leagues
        const [managed] = await db.insert(schema.leagues).values({
            name: catLeague.name,
            slug: catLeague.name.toLowerCase().replace(/ /g, '-'),
            country: catCountry?.name,
            logo: logoUrl,
            sourceName: catLeague.sourceName,
            sourceId: catLeague.sourceId,
            metadata: catLeague.metadata
        }).onConflictDoUpdate({
            target: [schema.leagues.sourceName, schema.leagues.sourceId],
            set: { updatedAt: new Date() }
        }).returning();

        return managed;
    }
}

export const repository: IRepository = {
    config: new SupabaseConfigRepository(),
    football: new SupabaseFootballRepository(),
};
