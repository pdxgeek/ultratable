import { cacheLogo, cacheImageById, getCachedImageById } from './cache';
import type { Graphic, GraphicType } from '../types';
import { db } from './dao/schema';

export class GfxRegistry {
    private graphics: Map<string, Graphic>; // ID -> Graphic (metadata always in memory)
    private blobCache: Map<string, { url: string; lastAccessed: number }>; // LRU cache for blob URLs
    private initialized: boolean = false;
    private readonly MAX_BLOB_CACHE_SIZE = 100; // Max blobs to keep in memory

    constructor() {
        this.graphics = new Map();
        this.blobCache = new Map();
    }

    // Evict least recently used blobs when cache is full
    private evictOldestBlobs(): void {
        if (this.blobCache.size <= this.MAX_BLOB_CACHE_SIZE) return;

        // Sort by lastAccessed and remove oldest entries
        const entries = Array.from(this.blobCache.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

        const toRemove = entries.slice(0, this.blobCache.size - this.MAX_BLOB_CACHE_SIZE);

        for (const [id, entry] of toRemove) {
            // Revoke the blob URL to free memory
            URL.revokeObjectURL(entry.url);
            this.blobCache.delete(id);
        }

        console.log(`Evicted ${toRemove.length} blob(s) from cache`);
    }

    // Initialize by loading all graphics from database
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const allGraphics = await db.graphics.toArray();
            const toDelete: string[] = [];

            for (const record of allGraphics) {
                // Skip and mark for deletion if URL is empty
                if (!record.sourceUrl || record.sourceUrl.trim() === '') {
                    toDelete.push(record.id);
                    continue;
                }

                const graphic: Graphic = {
                    id: record.id,
                    type: record.type as GraphicType,
                    associationId: record.associationId,
                    integrationId: record.integrationId,
                    commonName: record.commonName,
                    sourceUrl: record.sourceUrl,
                };
                this.graphics.set(graphic.id, graphic);
            }

            // Clean up graphics with empty URLs
            if (toDelete.length > 0) {
                await db.graphics.bulkDelete(toDelete);
                console.log(`Removed ${toDelete.length} graphics with empty URLs`);
            }

            console.log(`Loaded ${this.graphics.size} graphics from database`);
            this.initialized = true;
        } catch (err) {
            console.error('Failed to initialize graphics registry:', err);
        }
    }

    // Register a new graphic and return its ID
    async register(graphic: Graphic): Promise<string> {
        this.graphics.set(graphic.id, graphic);

        // Persist to database
        try {
            await db.graphics.put({
                id: graphic.id,
                type: graphic.type,
                associationId: graphic.associationId,
                integrationId: graphic.integrationId,
                commonName: graphic.commonName,
                sourceUrl: graphic.sourceUrl,
                timestamp: Date.now(),
            });
        } catch (err) {
            console.error('Failed to persist graphic to database:', err);
        }

        return graphic.id;
    }

    // Batch register graphics
    async registerBatch(graphics: Graphic[]): Promise<void> {
        const records = graphics.map(g => ({
            id: g.id,
            type: g.type,
            associationId: g.associationId,
            integrationId: g.integrationId,
            commonName: g.commonName,
            sourceUrl: g.sourceUrl,
            timestamp: Date.now(),
        }));

        // Add to in-memory map
        for (const g of graphics) {
            this.graphics.set(g.id, g);
        }

        // Persist to database in batch
        try {
            await db.graphics.bulkPut(records);
        } catch (err) {
            console.error('Failed to persist graphics batch to database:', err);
        }
    }

    getById(id: string): string | undefined {
        // First check in-memory cache
        const cached = this.blobCache.get(id);
        if (cached) {
            // Update last accessed time for LRU
            cached.lastAccessed = Date.now();
            return cached.url;
        }

        // If not in memory, try to load from IndexedDB synchronously
        // This will trigger async load in background
        this.loadById(id).catch(() => {});
        return undefined;
    }

    // Helper to find a graphic by association (e.g. Team ID) and type
    findId(associationId: string, type: GraphicType): string | undefined {
        for (const graphic of this.graphics.values()) {
            if (graphic.associationId === associationId && graphic.type === type) {
                return graphic.id;
            }
        }
        return undefined;
    }

    async loadById(id: string): Promise<string | undefined> {
        // Check in-memory cache first
        const cached = this.blobCache.get(id);
        if (cached) {
            cached.lastAccessed = Date.now();
            return cached.url;
        }

        // Try to load from IndexedDB by ID
        const cachedBlob = await getCachedImageById(id);
        if (cachedBlob) {
            this.blobCache.set(id, { url: cachedBlob, lastAccessed: Date.now() });
            this.evictOldestBlobs();
            return cachedBlob;
        }

        // Not in IndexedDB, fetch from source
        const graphic = this.graphics.get(id);
        if (!graphic) return undefined;
        await this.loadOne(graphic);
        const entry = this.blobCache.get(id);
        return entry?.url;
    }

    // Pre-load all known graphics
    async loadAll() {
        const promises: Promise<void>[] = [];
        for (const graphic of this.graphics.values()) {
            if (!this.blobCache.has(graphic.id)) {
                promises.push(this.loadOne(graphic));
            }
        }
        await Promise.all(promises);
    }

    private async loadOne(graphic: Graphic) {
        try {
            // Cache with ID as key (not URL)
            const blobUrl = await cacheImageById(graphic.id, graphic.sourceUrl);
            this.blobCache.set(graphic.id, { url: blobUrl, lastAccessed: Date.now() });
            this.evictOldestBlobs();
        } catch (e) {
            console.warn(`Failed to cache graphic ${graphic.id} (${graphic.sourceUrl})`, e);
        }
    }

    // Legacy support / Direct URL support
    // We can register ad-hoc URLs as 'misc' graphics if needed, or keep the old direct-URL method?
    // The previous implementation had getImage(url).
    // Let's keep a method that acts like the old one but maybe registers it internally?
    // Or just strictly move to IDs.
    // For backward compatibility with the task list, let's keep getImage(url) 
    // but maybe mapped to a 'misc' graphic?
    // Actually, the plan implies moving towards IDs.
    // But we still need to load the image.

    // Let's keep the raw URL loader for things that haven't been migrated or 
    // for just loading a URL.
    async loadUrl(url: string): Promise<string> {
        // Check if this URL matches any registered graphic?
        for (const g of this.graphics.values()) {
            if (g.sourceUrl === url) {
                const cached = this.blobCache.get(g.id);
                if (cached) {
                    cached.lastAccessed = Date.now();
                    return cached.url;
                }
                // If not cached, load it using its ID logic
                await this.loadOne(g);
                const entry = this.blobCache.get(g.id);
                return entry?.url || url;
            }
        }

        // If completely new, just cache it directly (legacy behavior)
        return cacheLogo(url);
    }
    // Legacy/Helper for Team Logos
    getLogo(teamId: string | number): string | undefined {
        const idStr = teamId.toString();
        const graphicId = this.findId(`team:${idStr}`, 'team_logo');
        if (!graphicId) return undefined;
        return this.getById(graphicId);
    }

    // Helper for Venue Images (associated with team)
    getVenue(teamId: string | number): string | undefined {
        const idStr = teamId.toString();
        const graphicId = this.findId(`team:${idStr}`, 'venue_image');
        if (!graphicId) return undefined;
        return this.getById(graphicId);
    }

    // Helper for Player Photos
    getPlayerPhoto(playerId: string | number): string | undefined {
        const idStr = playerId.toString();
        const graphicId = this.findId(`player:api-football:${idStr}`, 'player_photo');
        if (!graphicId) return undefined;
        return this.getById(graphicId);
    }

    // Get image by URL (for backwards compatibility)
    async getImage(url: string | null | undefined): Promise<string | null> {
        if (!url) return null;
        return this.loadUrl(url);
    }
}

export const gfxRegistry = new GfxRegistry();
