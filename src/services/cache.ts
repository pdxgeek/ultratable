import type { CacheEntry } from '../types';


const DB_NAME = 'ultratable';
const DB_VERSION = 1;
const LOGO_STORE = 'logos';

// ─── Persistence cache (LocalStorage) ──────────────────────────────────

export function getCache<T>(key: string): CacheEntry<T> | null {
    // Check Persistence
    try {
        const raw = localStorage.getItem(`ut_${key}`);
        if (!raw) return null;
        const entry = JSON.parse(raw) as CacheEntry<T>;
        return entry;
    } catch {
        return null;
    }
}

export function setCache<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        key,
    };

    // Write to Persistence
    try {
        localStorage.setItem(`ut_${key}`, JSON.stringify(entry));
    } catch (e) {
        console.warn('Cache write failed:', e);
    }
}

export function clearCache(prefix?: string): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix ? `ut_${prefix}` : 'ut_')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export function getCacheAge(key: string): number | null {
    const entry = getCache(key);
    if (!entry) return null;
    return Date.now() - entry.timestamp;
}

// ─── IndexedDB for logo blobs ──────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(LOGO_STORE)) {
                db.createObjectStore(LOGO_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getCachedLogo(url: string): Promise<string | null> {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(LOGO_STORE, 'readonly');
            const store = tx.objectStore(LOGO_STORE);
            const req = store.get(url);
            req.onsuccess = () => {
                if (req.result) {
                    resolve(URL.createObjectURL(req.result));
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function cacheImage(url: string): Promise<string> {
    // Check cache first
    const cached = await getCachedLogo(url);
    if (cached) return cached;

    // Download and store
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
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(LOGO_STORE, 'readwrite');
            const store = tx.objectStore(LOGO_STORE);
            store.put(blob, url);
            tx.oncomplete = () => {
                resolve(URL.createObjectURL(blob));
            };
            tx.onerror = () => {
                resolve(url); // Fallback to direct URL
            };
        });
    } catch (err) {
        // Silently fail - CORS errors are expected for some image sources
        // The UI will show placeholder avatars instead
        console.debug('Image caching failed (likely CORS):', url);
        return url; // Fallback to direct URL (will fail in img tag, triggering onError)
    }
}

export const cacheLogo = cacheImage;
