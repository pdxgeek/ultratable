import { cacheLogo, cacheImageById, getCachedImageById } from './cache';
import type { Graphic, GraphicType } from '../types';

export class GfxRegistry {
    private graphics: Map<string, Graphic>; // ID -> Graphic
    private blobCache: Map<string, string>; // ID -> BlobURL (in-memory cache)

    constructor() {
        this.graphics = new Map();
        this.blobCache = new Map();
    }

    // Register a new graphic and return its ID
    register(graphic: Graphic): string {
        this.graphics.set(graphic.id, graphic);
        return graphic.id;
    }

    // Batch register graphics
    registerBatch(graphics: Graphic[]) {
        for (const g of graphics) {
            this.register(g);
        }
    }

    getById(id: string): string | undefined {
        // First check in-memory cache
        if (this.blobCache.has(id)) {
            return this.blobCache.get(id);
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
        if (this.blobCache.has(id)) return this.blobCache.get(id);

        // Try to load from IndexedDB by ID
        const cachedBlob = await getCachedImageById(id);
        if (cachedBlob) {
            this.blobCache.set(id, cachedBlob);
            return cachedBlob;
        }

        // Not in IndexedDB, fetch from source
        const graphic = this.graphics.get(id);
        if (!graphic) return undefined;
        await this.loadOne(graphic);
        return this.blobCache.get(id);
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
            this.blobCache.set(graphic.id, blobUrl);
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
                if (this.blobCache.has(g.id)) return this.blobCache.get(g.id)!;
                // If not cached, load it using its ID logic
                await this.loadOne(g);
                return this.blobCache.get(g.id) || url;
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

    // Get image by URL (for backwards compatibility)
    async getImage(url: string | null | undefined): Promise<string | null> {
        if (!url) return null;
        return this.loadUrl(url);
    }
}

export const gfxRegistry = new GfxRegistry();
