import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';
import axios from 'axios';
import { storageProvider } from '../providers/supabase-storage.provider';
import crypto from 'node:crypto';

export class GraphicsService {
    private readonly BUCKET_NAME = 'graphics';

    /**
     * Downloads an image, hashes it, uploads it to Supabase Storage if it doesn't exist,
     * and maps it to the given entity in the database.
     * 
     * @param entityId The Postgres UUID of the entity (team, venue, player)
     * @param entityType The type of entity ('team', 'venue', 'player')
     * @param url The external URL to download the image from
     */
    async registerFromUrl(entityId: string, entityType: string, url: string): Promise<string | null> {
        try {
            // 1. Download image
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
            const buffer = Buffer.from(response.data);
            const mimeType = response.headers['content-type'] || 'image/png';

            // 2. Hash for deduplication
            const contentId = crypto.createHash('sha256').update(buffer).digest('hex');
            const blobPath = `blobs/${contentId}`;

            // 3. Upload to Supabase Storage
            // Using upsert: true means if another image had the exact same hash, it just overwrites it safely.
            const publicUrl = await storageProvider.upload(this.BUCKET_NAME, blobPath, buffer, mimeType, true);

            // 4. Map in Postgres
            await db.insert(schema.graphics)
                .values({
                    entityType,
                    entityId,
                    sourceUrl: url,
                    blobPath,
                    mimeType
                })
                .onConflictDoUpdate({
                    target: [schema.graphics.entityType, schema.graphics.entityId],
                    set: {
                        sourceUrl: url,
                        blobPath,
                        mimeType,
                        updatedAt: new Date()
                    }
                });

            return publicUrl;
        } catch (error: any) {
            console.error(`[GraphicsService] Failed to register graphic for ${entityType} ${entityId} from ${url}:`, error.message);
            return null;
        }
    }

    /**
     * Resolves the public URL for a given entity, if a graphic mapping exists.
     */
    async resolveUrl(entityId: string, entityType: string): Promise<string | null> {
        const [graphic] = await db
            .select()
            .from(schema.graphics)
            .where(
                and(
                    eq(schema.graphics.entityId, entityId),
                    eq(schema.graphics.entityType, entityType)
                )
            );

        if (!graphic) return null;

        return storageProvider.getPublicUrl(this.BUCKET_NAME, graphic.blobPath);
    }
    /**
     * Automatically attempts to resolve the API Football URL and fetch the graphic based purely on entity ID.
     */
    async autoSideloadGraphic(entityId: string, entityType: string): Promise<string | null> {
        let url: string | null = null;
        let row: { sourceId?: number | null } | undefined;

        if (entityType === 'player') {
            [row] = await db.select().from(schema.players).where(eq(schema.players.id, entityId));
            if (row?.sourceId) url = `https://media.api-sports.io/football/players/${row.sourceId}.png`;
        } else if (entityType === 'team') {
            [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, entityId));
            if (row?.sourceId) url = `https://media.api-sports.io/football/teams/${row.sourceId}.png`;
        } else if (entityType === 'venue') {
            [row] = await db.select().from(schema.venues).where(eq(schema.venues.id, entityId));
            if (row?.sourceId) url = `https://media.api-sports.io/football/venues/${row.sourceId}.png`;
        } else if (entityType === 'league') {
            [row] = await db.select().from(schema.leagues).where(eq(schema.leagues.id, entityId));
            if (!row) {
                [row] = await db.select().from(schema.catalogLeagues).where(eq(schema.catalogLeagues.id, entityId));
            }
            if (row?.sourceId) url = `https://media.api-sports.io/football/leagues/${row.sourceId}.png`;
        }

        if (!url) {
            console.error(`[GraphicsService] Could not auto-resolve source URL for ${entityType} ${entityId}`);
            return null;
        }

        return this.registerFromUrl(entityId, entityType, url);
    }
}

export const graphicsService = new GraphicsService();
