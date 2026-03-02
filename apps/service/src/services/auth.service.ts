import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';

/**
 * Resolved domain user identity from the authLinks bridge table.
 * This is the canonical "who is this user in OUR system" object.
 */
export interface DomainUser {
    id: string;
    name: string;
    email: string;
    roles: string[];
}

/**
 * LRU cache for domain user lookups.
 * Avoids hitting the database on every GraphQL request to resolve
 * the BetterAuth NanoID → Domain UUID mapping.
 *
 * Entries expire after 5 minutes and the cache holds at most 500 entries.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 500;

interface CacheEntry {
    user: DomainUser;
    expiresAt: number;
}

const domainUserCache = new Map<string, CacheEntry>();

function evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of domainUserCache) {
        if (entry.expiresAt <= now) {
            domainUserCache.delete(key);
        }
    }
}

/**
 * Resolves a BetterAuth NanoID user → Domain UUID user via the authLinks bridge.
 * Results are cached in-memory (LRU, 5min TTL) to avoid per-request DB joins.
 */
export async function resolveDomainUser(authUserId: string): Promise<DomainUser | null> {
    // Check cache first
    const cached = domainUserCache.get(authUserId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.user;
    }

    // Cache miss — query the bridge table
    const links = await db.select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        roles: schema.users.roles
    })
        .from(schema.authLinks)
        .innerJoin(schema.users, eq(schema.authLinks.domainUserId, schema.users.id))
        .where(eq(schema.authLinks.authUserId, authUserId))
        .limit(1);

    if (links.length === 0) {
        return null;
    }

    // jsonb columns infer as `unknown` in Drizzle — safely cast roles
    const row = links[0];
    const domainUser: DomainUser = {
        id: row.id,
        name: row.name,
        email: row.email,
        roles: Array.isArray(row.roles) ? (row.roles as string[]) : ['user']
    };

    // Evict stale entries before inserting
    if (domainUserCache.size >= CACHE_MAX_SIZE) {
        evictExpired();
    }
    // If still full after eviction, clear oldest quarter
    if (domainUserCache.size >= CACHE_MAX_SIZE) {
        const keysToDelete = Array.from(domainUserCache.keys()).slice(0, CACHE_MAX_SIZE / 4);
        keysToDelete.forEach(k => domainUserCache.delete(k));
    }

    domainUserCache.set(authUserId, {
        user: domainUser,
        expiresAt: Date.now() + CACHE_TTL_MS
    });

    return domainUser;
}

/**
 * Invalidates the cached domain user for a given auth user ID.
 * Call this after role changes or account linking operations.
 */
export function invalidateDomainUserCache(authUserId: string): void {
    domainUserCache.delete(authUserId);
}

/**
 * Converts Fastify IncomingHttpHeaders → Web Standard Headers object.
 * Used by both the GraphQL context and auth endpoints.
 */
export function toWebHeaders(fastifyHeaders: Record<string, string | string[] | undefined>): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(fastifyHeaders)) {
        if (value !== undefined) {
            headers.append(key, Array.isArray(value) ? value.join(',') : value);
        }
    }
    return headers;
}
