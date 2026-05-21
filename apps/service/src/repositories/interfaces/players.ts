import * as schema from '../../db/schema';

export interface PlayersRepository {
    getPlayerById(playerId: string): Promise<typeof schema.players.$inferSelect | null>;
    getPlayerData(playerId: number, season: number): Promise<(typeof schema.players.$inferSelect & { sourceId: number; name: string; metadata: Record<string, unknown>; statistics?: unknown }) | null>;
    resolvePlayerBySourceId(sourceName: string, sourceId: number): Promise<string | null>;
}
