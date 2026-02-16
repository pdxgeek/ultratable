import type { CacheEntry } from '../types';
import { database } from './db';

// ─── Generic Cache (Thin wrapper around opinionated DB) ───────────────────

export async function getCache<T>(key: string): Promise<CacheEntry<T> | null> {
    return await database.getCached<T>(key);
}

export async function setCache<T>(key: string, data: T): Promise<void> {
    await database.saveCached(key, data);
}

export async function clearCache(prefix?: string): Promise<void> {
    if (prefix) {
        // Clear specific prefix - would need to implement in database
        console.warn('Prefix-based cache clearing not yet implemented in opinionated DB');
    } else {
        await database.clearAllCache();
    }
}

export async function getCacheAge(key: string): Promise<number | null> {
    return await database.getCacheAge(key);
}

// ─── Image Blobs ───────────────────────────────────────────────────────────

export async function getCachedLogo(url: string): Promise<string | null> {
    // Legacy URL-based lookup - deprecated in favor of ID-based
    console.warn('getCachedLogo(url) is deprecated. Use getCachedImageById(id) instead.');
    return null;
}

export async function getCachedImageById(id: string): Promise<string | null> {
    return await database.getGraphicBlobUrl(id);
}

export async function cacheImageById(id: string, url: string): Promise<string> {
    // Skip empty URLs
    if (!url || url.trim() === '') {
        throw new Error('Empty URL provided');
    }

    // Check cache first
    const cached = await getCachedImageById(id);
    if (cached) return cached;

    // Download and store with ID as key
    try {
        const response = await fetch(url, {
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Accept': 'image/*',
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const blob = await response.blob();
        await database.saveGraphicBlob(id, blob);
        return URL.createObjectURL(blob);
    } catch (err) {
        // Silently fail - CORS errors are expected for some image sources
        // The UI will show placeholder avatars instead
        console.debug('Image caching failed (likely CORS):', url);
        return url; // Fallback to direct URL (will fail in img tag, triggering onError)
    }
}

export async function cacheImage(url: string): Promise<string> {
    // Legacy URL-based caching - deprecated
    console.warn('cacheImage(url) is deprecated. Use cacheImageById(id, url) instead.');
    return url;
}

export const cacheLogo = cacheImage;
