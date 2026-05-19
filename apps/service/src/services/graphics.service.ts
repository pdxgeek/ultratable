import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import axios from 'axios';
import { storageProvider } from '../providers/supabase-storage.provider';
import crypto from 'node:crypto';
import { globalLogger } from './log.service';

const logger = globalLogger.child({ module: 'GraphicsService' });

export interface SideloadCandidate {
    entityId: string;
    entityType: string;
    url: string | null | undefined;
}

const NOW_MS = sql`date_trunc('milliseconds', now())`;

const ENTITY_TABLES = {
    team: schema.teams,
    venue: schema.venues,
    league: schema.leagues,
    player: schema.players,
} as const;

type GraphicEntityType = keyof typeof ENTITY_TABLES;

async function bumpEntityUpdatedAt(entityType: string, entityId: string): Promise<void> {
    const table = ENTITY_TABLES[entityType as GraphicEntityType];
    if (!table) return;
    await db.update(table).set({ updatedAt: NOW_MS }).where(eq(table.id, entityId));
}

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
        logger.debug({ entityType, entityId, url }, 'Graphic: registering from URL');
        try {
            // Validate URL scheme to prevent SSRF (e.g., file://, internal IPs)
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                logger.warn({ entityType, entityId, url }, `Rejected graphic URL with disallowed protocol: ${parsed.protocol}`);
                return null;
            }

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

            // Bump parent's updatedAt so delta-sync clients re-fetch and pick up the registry URL.
            await bumpEntityUpdatedAt(entityType, entityId);

            return publicUrl;
        } catch (error: unknown) {
            logger.error({ entityType, entityId, url, error: (error as Error).message }, `Failed to register graphic for ${entityType} ${entityId}`);
            return null;
        }
    }

    /**
     * Fire-and-forget graphic registration with uniform soft-fail logging.
     * Use this from import paths where a graphic failure must never block the
     * surrounding sync. For the rare caller that needs the awaited URL, call
     * registerFromUrl directly.
     */
    sideload(entityId: string, entityType: string, url: string): void {
        this.registerFromUrl(entityId, entityType, url).catch((e: Error) =>
            logger.warn({ error: e.message, entityType, entityId }, `Soft-fail on sideload for ${entityType} ${entityId}`)
        );
    }

    /**
     * Batch variant of sideload: filters out candidates with no URL or that
     * already have a graphic row, then fires sideload for the rest. Keeps the
     * dedup logic in one place so callers don't have to roll their own.
     */
    async sideloadMissing(candidates: SideloadCandidate[]): Promise<void> {
        const usable = candidates.filter((c): c is SideloadCandidate & { url: string } => Boolean(c.url));
        if (usable.length === 0) return;

        const existing = await db
            .select({ entityId: schema.graphics.entityId, entityType: schema.graphics.entityType })
            .from(schema.graphics)
            .where(inArray(schema.graphics.entityId, usable.map(c => c.entityId)));
        const existingKey = new Set(existing.map(g => `${g.entityType}:${g.entityId}`));

        for (const c of usable) {
            if (existingKey.has(`${c.entityType}:${c.entityId}`)) continue;
            this.sideload(c.entityId, c.entityType, c.url);
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
            logger.error({ entityType, entityId }, `Could not auto-resolve source URL for ${entityType} ${entityId}`);
            return null;
        }

        return this.registerFromUrl(entityId, entityType, url);
    }
}

export const graphicsService = new GraphicsService();
