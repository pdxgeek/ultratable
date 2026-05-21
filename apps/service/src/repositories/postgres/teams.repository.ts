import { and, count, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import * as schema from '../../db/schema';
import { IFootballProvider } from '../../integrations/types';
import { cacheService, TTL } from '../../services/cache.service';
import { graphicsService } from '../../services/graphics.service';
import { globalLogger } from '../../services/log.service';
import { TeamsRepository } from '../teams';
import { NOW_MS } from './shared';

const logger = globalLogger.child({ module: 'PostgresTeamsRepository' });

export class PostgresTeamsRepository implements TeamsRepository {
    constructor(private provider: IFootballProvider) {}

    async getTeams(
        leagueSourceId: number,
        seasonYear: number,
        since?: Date,
    ): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db) return [];

        const cacheKey = `teams:${leagueSourceId}:${seasonYear}`;
        if (!since) {
            const cached = cacheService.get<Array<typeof schema.teams.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        const [localLeague] = await db
            .select()
            .from(schema.leagues)
            .where(eq(schema.leagues.sourceId, leagueSourceId));
        if (!localLeague) return [];

        const [localSeason] = await db
            .select()
            .from(schema.seasons)
            .where(
                sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`,
            );
        if (!localSeason) return [];

        let query = db
            .select({ team: schema.teams })
            .from(schema.teams)
            .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
            .where(eq(schema.seasonsToTeams.seasonId, localSeason.id));

        if (since) {
            query = db
                .select({ team: schema.teams })
                .from(schema.teams)
                .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
                .where(
                    and(
                        eq(schema.seasonsToTeams.seasonId, localSeason.id),
                        gt(schema.teams.updatedAt, since),
                    ),
                );
        }

        const res = await query;
        const result = res.map((r) => r.team);
        if (!since) {
            cacheService.set(cacheKey, result, TTL.STABLE);
        }
        return result;
    }

    async getAllTeams(): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db) return [];
        return db.select().from(schema.teams);
    }

    async getTeamById(teamId: string): Promise<typeof schema.teams.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
        return row ?? null;
    }

    async getTeamsByIds(
        teamIds: readonly string[],
    ): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db || teamIds.length === 0) return [];
        return db
            .select()
            .from(schema.teams)
            .where(inArray(schema.teams.id, [...teamIds]));
    }

    async getTeamsBySeasonId(
        seasonId: string,
        since?: Date,
    ): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db) return [];

        const cacheKey = `teams:season:${seasonId}`;
        if (!since) {
            const cached = cacheService.get<Array<typeof schema.teams.$inferSelect>>(cacheKey);
            if (cached) return cached;
        }

        const conditions = [eq(schema.seasonsToTeams.seasonId, seasonId)];
        if (since) {
            conditions.push(gt(schema.teams.updatedAt, since));
        }

        const res = await db
            .select({ team: schema.teams })
            .from(schema.teams)
            .innerJoin(schema.seasonsToTeams, eq(schema.teams.id, schema.seasonsToTeams.teamId))
            .where(and(...conditions));

        const result = res.map((r) => r.team);
        if (!since) {
            cacheService.set(cacheKey, result, TTL.STABLE);
        }
        return result;
    }

    async countTeamsInSeason(seasonId: string): Promise<number> {
        if (!db) return 0;
        const [res] = await db
            .select({ val: count() })
            .from(schema.seasonsToTeams)
            .where(eq(schema.seasonsToTeams.seasonId, seasonId));
        return Number(res?.val ?? 0);
    }

    /**
     * Sync: fetches teams from the external API, upserts into DB, and sideloads graphics.
     * Called by syncFixtures() and admin import operations — NOT by read queries.
     */
    async syncTeams(
        leagueSourceId: number,
        seasonYear: number,
    ): Promise<Array<typeof schema.teams.$inferSelect>> {
        if (!db) return [];

        const [localLeague] = await db
            .select()
            .from(schema.leagues)
            .where(eq(schema.leagues.sourceId, leagueSourceId));
        if (!localLeague) throw new Error(`League ${leagueSourceId} not found`);

        const [localSeason] = await db
            .select()
            .from(schema.seasons)
            .where(
                sql`${schema.seasons.leagueId} = ${localLeague.id} AND ${schema.seasons.year} = ${seasonYear}`,
            );
        if (!localSeason)
            throw new Error(`Season ${seasonYear} not found for league ${leagueSourceId}`);

        const { teams, venues } = await this.provider.getTeams(leagueSourceId, seasonYear);

        await this.upsertVenues(venues);

        const currentVenues = await db
            .select()
            .from(schema.venues)
            .where(eq(schema.venues.sourceName, this.provider.name));
        const venueMap = new Map<number, string>(currentVenues.map((v) => [v.sourceId, v.id]));

        const teamsToInsert = teams.map((t) => ({
            name: t.name,
            shortName: t.shortName,
            tla: t.tla,
            logo: t.logo,
            venueId: t.venueSourceId ? venueMap.get(t.venueSourceId) : null,
            sourceName: t.sourceName,
            sourceId: t.sourceId,
            metadata: {},
            updatedAt: NOW_MS,
        }));

        await db
            .insert(schema.teams)
            .values(teamsToInsert)
            .onConflictDoUpdate({
                target: [schema.teams.sourceName, schema.teams.sourceId],
                set: {
                    name: sql`EXCLUDED.name`,
                    shortName: sql`EXCLUDED.short_name`,
                    tla: sql`EXCLUDED.tla`,
                    logo: sql`EXCLUDED.logo`,
                    venueId: sql`EXCLUDED.venue_id`,
                    updatedAt: NOW_MS,
                },
            });

        const teamList = await db
            .select()
            .from(schema.teams)
            .where(eq(schema.teams.sourceName, this.provider.name));
        const teamMap = new Map<number, string>(teamList.map((t) => [t.sourceId, t.id]));

        await graphicsService.sideloadMissing([
            ...teams.flatMap((t) => {
                const id = teamMap.get(t.sourceId);
                return id ? [{ entityId: id, entityType: 'team', url: t.logo }] : [];
            }),
            ...venues.flatMap((v) => {
                const id = venueMap.get(v.sourceId);
                return id ? [{ entityId: id, entityType: 'venue', url: v.image }] : [];
            }),
        ]);

        const linkages = teams
            .map((item) => {
                const teamId = teamMap.get(item.sourceId);
                if (!teamId) return null;
                return {
                    seasonId: localSeason.id,
                    teamId: teamId,
                    updatedAt: NOW_MS,
                };
            })
            .filter(Boolean);

        if (linkages.length > 0) {
            await db
                .insert(schema.seasonsToTeams)
                .values(linkages as unknown as (typeof schema.seasonsToTeams.$inferInsert)[])
                .onConflictDoUpdate({
                    target: [schema.seasonsToTeams.seasonId, schema.seasonsToTeams.teamId],
                    set: { updatedAt: NOW_MS },
                });
        }

        // The legacy `teams:${sourceId}:${year}` invalidation is done by the caller,
        // but the UUID-keyed cache used by getTeamsBySeasonId lives under `teams:season:${seasonId}`.
        // Invalidate it here so the next read picks up the freshly linked teams.
        cacheService.invalidate(`teams:season:${localSeason.id}`);

        let squadApiCalls = 0;
        for (const t of teams) {
            const teamId = teamMap.get(t.sourceId);
            if (!teamId) continue;
            try {
                await this.importSquad(teamId, t.sourceId, localSeason.id);
                squadApiCalls++;
            } catch (e: unknown) {
                logger.warn(
                    { error: (e as Error).message, teamSourceId: t.sourceId },
                    'Soft-fail on squad import',
                );
            }
        }
        logger.info(
            { leagueSourceId, seasonYear, teamCount: teams.length, squadApiCalls },
            'Squad import complete',
        );

        cacheService.invalidate(`teams:${leagueSourceId}:${seasonYear}`);
        return this.getTeams(leagueSourceId, seasonYear);
    }

    async getVenueById(venueId: string): Promise<typeof schema.venues.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.venues).where(eq(schema.venues.id, venueId));
        return row ?? null;
    }

    async getVenuesByIds(
        venueIds: readonly string[],
    ): Promise<Array<typeof schema.venues.$inferSelect>> {
        if (!db || venueIds.length === 0) return [];
        return db
            .select()
            .from(schema.venues)
            .where(inArray(schema.venues.id, [...venueIds]));
    }

    async getVenuesBySeasonId(
        seasonId: string,
        since?: Date,
    ): Promise<Array<typeof schema.venues.$inferSelect>> {
        if (!db) return [];
        const conditions = [eq(schema.fixtures.seasonId, seasonId)];
        if (since) conditions.push(gt(schema.venues.updatedAt, since));

        const res = await db
            .selectDistinct({ venue: schema.venues })
            .from(schema.venues)
            .innerJoin(schema.fixtures, eq(schema.fixtures.venueId, schema.venues.id))
            .where(and(...conditions));
        return res.map((r) => r.venue);
    }

    async upsertVenues(venues: import('../../integrations/types').IngestedVenue[]): Promise<void> {
        if (!db || venues.length === 0) return;

        const uniqueVenues = Array.from(
            new Map(
                venues
                    .filter((v) => v.sourceId !== null && v.sourceId !== undefined)
                    .map((v) => [v.sourceId, v]),
            ).values(),
        );

        if (uniqueVenues.length === 0) return;

        await db
            .insert(schema.venues)
            .values(uniqueVenues)
            .onConflictDoUpdate({
                target: [schema.venues.sourceName, schema.venues.sourceId],
                set: {
                    name: sql`EXCLUDED.name`,
                    city: sql`COALESCE(EXCLUDED.city, ${schema.venues.city})`,
                    capacity: sql`COALESCE(EXCLUDED.capacity, ${schema.venues.capacity})`,
                    surface: sql`COALESCE(EXCLUDED.surface, ${schema.venues.surface})`,
                    image: sql`COALESCE(EXCLUDED.image, ${schema.venues.image})`,
                    updatedAt: NOW_MS,
                },
            });
    }

    /**
     * Fetches the squad for a team from the external provider and creates:
     * 1. Player records (upserted)
     * 2. Player source mappings (for multi-source resolution)
     * 3. Team roster entries (with metadata for display data)
     */
    async importSquad(
        teamId: string,
        teamSourceId: number,
        seasonId: string,
    ): Promise<(typeof schema.teamRosters.$inferSelect)[]> {
        const squad = await this.provider.getSquad(teamSourceId);
        if (!squad.length) return [];

        const rosterEntries: (typeof schema.teamRosters.$inferSelect)[] = [];

        for (const member of squad) {
            const playerMetadata = {
                age: member.age,
                photo: member.photo,
            };

            const [player] = await db
                .insert(schema.players)
                .values({
                    name: member.name,
                    sourceName: this.provider.name,
                    sourceId: member.sourceId,
                    metadata: playerMetadata,
                })
                .onConflictDoUpdate({
                    target: [schema.players.sourceName, schema.players.sourceId],
                    set: {
                        name: member.name,
                        metadata: playerMetadata,
                        updatedAt: NOW_MS,
                    },
                })
                .returning();

            await db
                .insert(schema.playerSourceMappings)
                .values({
                    playerId: player.id,
                    sourceName: this.provider.name,
                    sourceId: member.sourceId,
                })
                .onConflictDoUpdate({
                    target: [
                        schema.playerSourceMappings.sourceName,
                        schema.playerSourceMappings.sourceId,
                    ],
                    set: {
                        playerId: player.id,
                        updatedAt: NOW_MS,
                    },
                });

            const rosterMetadata = {
                squadNumber: member.number,
                position: member.position,
            };

            const [rosterEntry] = await db
                .insert(schema.teamRosters)
                .values({
                    teamId,
                    playerId: player.id,
                    seasonId,
                    metadata: rosterMetadata,
                })
                .onConflictDoUpdate({
                    target: [
                        schema.teamRosters.teamId,
                        schema.teamRosters.playerId,
                        schema.teamRosters.seasonId,
                    ],
                    set: {
                        metadata: rosterMetadata,
                        updatedAt: NOW_MS,
                    },
                })
                .returning();

            rosterEntries.push(rosterEntry);

            if (member.photo && player.id) {
                graphicsService.sideload(player.id, 'player', member.photo);
            }
        }

        logger.info({ teamId, seasonId, playerCount: rosterEntries.length }, 'Squad imported');
        return rosterEntries;
    }

    async getTeamRoster(
        teamId: string,
        seasonId: string,
    ): Promise<
        (typeof schema.teamRosters.$inferSelect & { player: typeof schema.players.$inferSelect })[]
    > {
        const rows = await db
            .select()
            .from(schema.teamRosters)
            .innerJoin(schema.players, eq(schema.teamRosters.playerId, schema.players.id))
            .where(
                and(
                    eq(schema.teamRosters.teamId, teamId),
                    eq(schema.teamRosters.seasonId, seasonId),
                ),
            );

        return rows.map((row) => ({
            ...row.team_rosters,
            player: row.players,
        }));
    }
}
