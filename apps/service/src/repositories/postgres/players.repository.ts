import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { IFootballProvider } from '../../integrations/types';
import { graphicsService } from '../../services/graphics.service';
import { cacheService, TTL } from '../../services/cache.service';
import { PlayersRepository } from '../interfaces';

export class PostgresPlayersRepository implements PlayersRepository {
    constructor(private provider: IFootballProvider) {}

    async getPlayerById(playerId: string): Promise<typeof schema.players.$inferSelect | null> {
        if (!db) return null;
        const [row] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
        return row ?? null;
    }

    async getPlayerData(playerId: number, season: number): Promise<(typeof schema.players.$inferSelect & { sourceId: number; name: string; metadata: Record<string, unknown>; statistics?: unknown }) | null> {
        const cacheKey = `player:${playerId}:${season}`;
        type PlayerResult = typeof schema.players.$inferSelect & { sourceId: number; name: string; metadata: Record<string, unknown>; statistics?: unknown };
        const cached = cacheService.get<PlayerResult>(cacheKey);
        if (cached) return cached;

        const data = await this.provider.getPlayerData(playerId, season);
        if (!data) return null;

        const playerMetadata = {
            firstname: data.firstname || null,
            lastname: data.lastname || null,
            age: data.age || null,
            nationality: data.nationality || null,
            photo: data.photo || null,
            injured: data.injured || false,
            height: data.height || null,
            weight: data.weight || null,
        };

        const [upserted] = await db.insert(schema.players)
            .values({
                name: data.name,
                sourceName: this.provider.name,
                sourceId: playerId,
                metadata: playerMetadata,
            })
            .onConflictDoUpdate({
                target: [schema.players.sourceName, schema.players.sourceId],
                set: {
                    name: data.name,
                    metadata: playerMetadata,
                    updatedAt: new Date(),
                }
            })
            .returning();

        if (data.photo && upserted) {
            graphicsService.sideload(upserted.id, 'player', data.photo);
        }

        const result: PlayerResult = {
            ...upserted,
            sourceId: playerId,
            metadata: playerMetadata,
            statistics: data.statistics,
        };
        cacheService.set(cacheKey, result, TTL.ACTIVE);
        return result;
    }

    async resolvePlayerBySourceId(sourceName: string, sourceId: number): Promise<string | null> {
        const [mapping] = await db.select({ playerId: schema.playerSourceMappings.playerId })
            .from(schema.playerSourceMappings)
            .where(and(
                eq(schema.playerSourceMappings.sourceName, sourceName),
                eq(schema.playerSourceMappings.sourceId, sourceId),
            ));
        if (mapping) return mapping.playerId;

        const [player] = await db.select({ id: schema.players.id })
            .from(schema.players)
            .where(and(
                eq(schema.players.sourceName, sourceName),
                eq(schema.players.sourceId, sourceId),
            ));
        return player?.id || null;
    }
}
