import { cacheLogo } from './cache';
import type { Graphic, GraphicType, Player, GraphicVariant } from '../types';
import { db, type GraphicRecord } from './dao/schema';
import { database } from './db';
import { generateDeterministicId } from './idUtils';

export class GfxRegistry {
    private graphics: Map<string, Graphic>; // ID -> Graphic (metadata always in memory)
    private blobCache: Map<string, { url: string; lastAccessed: number }>; // LRU cache for blob URLs
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;
    private readonly MAX_BLOB_CACHE_SIZE = 2000;
    private activeDownloads: Set<string> = new Set();
    private totalStarted: number = 0;
    private totalFinished: number = 0;
    private batchStartTime: number | null = null;
    private queueListeners: Set<(stats: { activeIds: string[], totalStarted: number, totalFinished: number, rate: number }) => void> = new Set();

    constructor() {
        this.graphics = new Map();
        this.blobCache = new Map();
    }

    private cacheBlob(key: string, url: string) {
        this.blobCache.set(key, { url, lastAccessed: Date.now() });
        this.evictOldestBlobs();
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

    private notifyQueueListeners(): void {
        const activeIds = Array.from(this.activeDownloads);

        let rate = 0;
        if (this.batchStartTime && this.totalFinished > 0) {
            const elapsedSec = (Date.now() - this.batchStartTime) / 1000;
            rate = elapsedSec > 0 ? this.totalFinished / elapsedSec : 0;
        }

        const stats = {
            activeIds,
            totalStarted: this.totalStarted,
            totalFinished: this.totalFinished,
            rate
        };

        this.queueListeners.forEach(l => l(stats));

        // Reset batch if everything is finished
        if (activeIds.length === 0) {
            this.totalStarted = 0;
            this.totalFinished = 0;
            this.batchStartTime = null;
        }
    }

    subscribeToQueue(callback: (stats: { activeIds: string[], totalStarted: number, totalFinished: number, rate: number }) => void): () => void {
        this.queueListeners.add(callback);

        const activeIds = Array.from(this.activeDownloads);
        let rate = 0;
        if (this.batchStartTime && this.totalFinished > 0) {
            const elapsedSec = (Date.now() - this.batchStartTime) / 1000;
            rate = elapsedSec > 0 ? this.totalFinished / elapsedSec : 0;
        }

        callback({
            activeIds,
            totalStarted: this.totalStarted,
            totalFinished: this.totalFinished,
            rate
        });
        return () => this.queueListeners.delete(callback);
    }

    // Initialize by loading all graphics from database
    async initialize(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {

            try {
                // Run migrations and cleanup once before loading into memory
                await database.migrateGraphicsAssociationIds();
                await database.purgeBrokenGraphics();

                const allGraphics = await db.graphics.toArray();

                for (const record of allGraphics) {
                    // Determine associationType if missing (migration bridge)
                    const assocType = (record as any).associationType ||
                        (record.type === 'player_photo' ? 'player' : 'team');

                    const graphic: Graphic = {
                        id: record.id,
                        type: record.type as GraphicType,
                        associationId: record.associationId,
                        associationType: assocType as any,
                        externalReferences: record.externalReferences,
                        commonName: record.commonName,
                        variants: record.variants || [],
                        activeVariantIndex: record.activeVariantIndex,
                        lastRefreshed: record.lastRefreshed || new Date().toISOString(),
                    };

                    // Backwards compatibility for flat records during migration
                    if (!record.variants && (record as any).sourceUrl) {
                        graphic.variants = [{
                            sourceUrl: (record as any).sourceUrl,
                            blobHash: (record as any).blobHash || '',
                            lastRefreshed: record.lastRefreshed || new Date().toISOString()
                        }];
                    }

                    this.graphics.set(graphic.id, graphic);
                }

                console.log(`Loaded ${this.graphics.size} graphics from database`);
                this.initialized = true;
            } catch (err) {
                console.error('Failed to initialize graphics registry:', err);
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    // Register a new graphic variant for an association
    async register(graphic: Partial<Graphic> & { sourceUrl: string; tag?: string }): Promise<string> {
        const type = graphic.type || 'team_logo';
        const assocId = graphic.associationId || '';
        const assocType = graphic.associationType || (type === 'player_photo' ? 'player' : 'team');

        // 1. Deterministic Slot ID calculation
        const slotId = this.calculateSlotId(assocId, type);
        let existing = this.graphics.get(slotId);

        if (!existing) {
            // Check database if not in memory
            const record = await db.graphics.get(slotId);
            if (record) {
                existing = {
                    id: record.id,
                    type: record.type as GraphicType,
                    associationId: record.associationId,
                    associationType: record.associationType as any,
                    externalReferences: record.externalReferences,
                    commonName: record.commonName,
                    variants: record.variants || [],
                    activeVariantIndex: record.activeVariantIndex,
                    lastRefreshed: record.lastRefreshed || new Date().toISOString(),
                };
                this.graphics.set(slotId, existing);
            } else {
                // Create a new deterministic slot
                const newGraphic: Graphic = {
                    id: slotId,
                    type,
                    associationId: assocId,
                    associationType: assocType as any,
                    commonName: graphic.commonName || 'Unnamed Graphic',
                    externalReferences: graphic.externalReferences || [],
                    variants: [],
                    lastRefreshed: new Date().toISOString()
                };
                this.graphics.set(slotId, newGraphic);
                existing = newGraphic;
            }
        }

        // 2. See if this specific URL is already in the variants
        const hasVariant = existing.variants.some(v => v.sourceUrl === graphic.sourceUrl);
        if (hasVariant) return slotId;

        // 3. Append new variant (Gallery logic)
        const newVariant: GraphicVariant = {
            sourceUrl: graphic.sourceUrl,
            blobHash: '', // Will be populated by loadById/cache
            lastRefreshed: new Date().toISOString(),
            tag: graphic.tag
        };
        existing.variants.push(newVariant);
        existing.lastRefreshed = newVariant.lastRefreshed;

        // Persist to database
        try {
            const record: GraphicRecord = {
                id: existing.id,
                type: existing.type,
                associationId: existing.associationId,
                associationType: existing.associationType,
                externalReferences: existing.externalReferences,
                commonName: existing.commonName,
                variants: existing.variants,
                activeVariantIndex: existing.activeVariantIndex,
                timestamp: Date.now(),
                lastRefreshed: existing.lastRefreshed
            };
            await db.graphics.put(record);
            console.log(`[GfxDebug] Persisted graphic record ${existing.id} to DB.`);
        } catch (err) {
            console.error('[GfxDebug] Failed to persist graphic:', err);
        }

        return slotId;
    }

    // Batch register graphics
    async registerBatch(graphics: (Partial<Graphic> & { sourceUrl: string; tag?: string })[]): Promise<string[]> {
        const results: string[] = [];
        for (const g of graphics) {
            results.push(await this.register(g));
        }
        return results;
    }

    // Find all graphic IDs for an association directly from the database
    async getManyByAssociation(associationId: string, type: GraphicType): Promise<string[]> {
        // Check memory first
        const inMem: string[] = [];
        for (const g of this.graphics.values()) {
            if (g.associationId === associationId && g.type === type) {
                inMem.push(g.id);
            }
        }

        try {
            const records = await db.graphics
                .where('associationId')
                .equals(associationId)
                .and(r => r.type === type)
                .toArray();

            const ids: string[] = [];
            for (const record of records) {
                // Rehydrate in memory if found
                this.graphics.set(record.id, {
                    id: record.id,
                    type: record.type as GraphicType,
                    associationId: record.associationId,
                    associationType: record.associationType as any,
                    externalReferences: record.externalReferences,
                    commonName: record.commonName,
                    variants: record.variants || [],
                    activeVariantIndex: record.activeVariantIndex,
                    lastRefreshed: record.lastRefreshed || new Date().toISOString()
                });
                ids.push(record.id);
            }
            return ids;
        } catch (err) {
            console.error('Failed to lookup association in database:', err);
        }
        return inMem;
    }

    // Get all registered graphics
    getAll(): Graphic[] {
        return Array.from(this.graphics.values());
    }

    // Delete a graphic
    async deleteGraphic(id: string): Promise<void> {
        this.graphics.delete(id);
        const cached = this.blobCache.get(id);
        if (cached) {
            URL.revokeObjectURL(cached.url);
            this.blobCache.delete(id);
        }
        await db.graphics.delete(id);
        // Also ensure it's removed from the blob table if it exists there
        await db.blobs.delete(id);
    }

    // Report a broken graphic so it can be cleared from the DB
    async reportError(id: string): Promise<void> {
        console.warn(`Reporting broken graphic: ${id}. Clearing from DB.`);
        await this.deleteGraphic(id);
    }

    // Helper to calculate a deterministic Slot ID for an entity:type pair
    calculateSlotId(associationId: string, type: GraphicType): string {
        return generateDeterministicId(`${type}:${associationId}`);
    }

    // Helper for findId - now deterministic
    findId(associationId: string, type: GraphicType): string {
        return this.calculateSlotId(associationId, type);
    }

    // Individual lookup (returns first match)
    async getByAssociation(associationId: string, type: GraphicType): Promise<string | undefined> {
        const ids = await this.getManyByAssociation(associationId, type);
        return ids.length > 0 ? ids[0] : undefined;
    }

    // Load binary content for a graphic (latest variant by default)
    async loadById(id: string, variantIndex?: number): Promise<string | undefined> {
        await this.initialize();
        const graphic = this.graphics.get(id);
        if (!graphic || graphic.variants.length === 0) return undefined;

        // Use specified variant or active or latest
        const idx = variantIndex !== undefined ? variantIndex :
            graphic.activeVariantIndex !== undefined ? graphic.activeVariantIndex :
                graphic.variants.length - 1;

        const variant = graphic.variants[idx];
        if (!variant) return undefined;

        // Check memory cache
        const cacheKey = `${id}:${idx}`;
        if (this.blobCache.has(cacheKey)) {
            const entry = this.blobCache.get(cacheKey)!;
            entry.lastAccessed = Date.now();
            return entry.url;
        }

        try {
            if (this.activeDownloads.size === 0) {
                this.batchStartTime = Date.now();
            }
            this.activeDownloads.add(id);
            this.totalStarted++;
            this.notifyQueueListeners();

            // Load from DB
            const blob = await database.getGraphicBlob(id, idx);
            if (blob) {
                const url = URL.createObjectURL(blob);
                this.cacheBlob(cacheKey, url);
                return url;
            }

            // Fallback: Download from source
            if (variant.sourceUrl && variant.sourceUrl.startsWith('http')) {
                try {
                    const response = await fetch(variant.sourceUrl);
                    const blob = await response.blob();

                    // Cache blob in vault directly (now using generateContentId internally in saveGraphicBlob)
                    const contentId = await database.saveGraphicBlob(id, blob, idx);
                    console.log(`[GfxDebug] Downloaded and saved blob ${contentId} for ${id}`);

                    // Update variant in memory
                    variant.blobHash = contentId;
                    await db.graphics.update(id, { variants: graphic.variants });

                    const url = URL.createObjectURL(blob);
                    this.cacheBlob(cacheKey, url);
                    return url;
                } catch (err) {
                    console.error(`Failed to download graphic fallback for ${id}:`, err);
                }
            }
        } catch (err) {
            console.error(`Failed to load graphic ${id}:`, err);
        } finally {
            this.activeDownloads.delete(id);
            this.totalFinished++;
            this.notifyQueueListeners();
        }

        return undefined;
    }

    // Get a cached blob URL synchronously (latest variant)
    getById(id: string): string | undefined {
        const graphic = this.graphics.get(id);
        if (!graphic || graphic.variants.length === 0) return undefined;

        const idx = graphic.activeVariantIndex !== undefined ? graphic.activeVariantIndex :
            graphic.variants.length - 1;
        const cacheKey = `${id}:${idx}`;
        const entry = this.blobCache.get(cacheKey);
        if (entry) {
            entry.lastAccessed = Date.now();
            return entry.url;
        }
        return undefined;
    }

    // Pre-load graphics. If IDs are provided, only those are loaded.
    async loadAll(ids?: string[]) {
        const promises: Promise<void>[] = [];
        const targets = ids
            ? ids.map(id => this.graphics.get(id)).filter((g): g is Graphic => !!g)
            : Array.from(this.graphics.values());

        for (const graphic of targets) {
            if (graphic.variants.length > 0) {
                promises.push(this.loadById(graphic.id).then(() => { }));
            }
        }
        await Promise.all(promises);
    }

    // (Removed stale loadOne logic)

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
    // Let's keep the raw URL loader for things that haven't been migrated
    async loadUrl(url: string): Promise<string> {
        // Check if this URL matches any registered graphic variant
        for (const g of this.graphics.values()) {
            const vIdx = g.variants.findIndex(v => v.sourceUrl === url);
            if (vIdx !== -1) {
                const cached = this.blobCache.get(`${g.id}:${vIdx}`);
                if (cached) {
                    cached.lastAccessed = Date.now();
                    return cached.url;
                }
                // If not cached, load it
                return (await this.loadById(g.id, vIdx)) || url;
            }
        }

        // If completely new, just cache it directly (legacy behavior)
        return cacheLogo(url);
    }
    // Legacy/Helper for Team Logos
    getLogo(teamId: string | number): string | undefined {
        const idStr = teamId.toString();
        const graphicId = this.findId(idStr, 'team_logo'); // Pure NanoID
        if (!graphicId) return undefined;
        return this.getById(graphicId);
    }

    // Helper for Venue Images (associated with team)
    getVenue(teamId: string | number): string | undefined {
        const idStr = teamId.toString();
        const graphicId = this.findId(idStr, 'venue_image'); // Pure NanoID
        if (!graphicId) return undefined;
        return this.getById(graphicId);
    }

    // Helper for Player Photos
    getPlayerPhoto(player: Player | string): string | undefined {
        const id = typeof player === 'string' ? player : player.id;
        // First try finding by associationId (Deterministic)
        let graphicId = this.findId(id, 'player_photo');

        if (!graphicId && typeof player !== 'string') {
            const ref = player.externalReferences?.find(r => r.integrationName === 'api-football');
            if (ref) {
                graphicId = this.findId(`player:api-football:${ref.remoteId}`, 'player_photo');
            }
        }

        if (!graphicId) return undefined;
        return this.getById(graphicId);
    }

    // Get image by URL (for backwards compatibility)
    async getImage(url: string | null | undefined): Promise<string | null> {
        if (!url) return null;
        return this.loadUrl(url);
    }

    // Purge everything from memory and database
    async purge(): Promise<void> {
        // Clear memory
        this.graphics.clear();
        for (const entry of this.blobCache.values()) {
            URL.revokeObjectURL(entry.url);
        }
        this.blobCache.clear();

        // Clear database
        try {
            await db.graphics.clear();
            await db.blobs.clear();
        } catch (err) {
            console.error('Failed to purge graphics from database:', err);
        }

        console.log('Graphics registry purged completely.');
        this.notifyQueueListeners();
    }
}

export const gfxRegistry = new GfxRegistry();
