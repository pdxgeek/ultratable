import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { LRUCache } from 'lru-cache';
import { globalLogger } from './log.service';

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
 * Uses lru-cache for proper LRU eviction (by access order, not insertion order).
 */
const domainUserCache = new LRUCache<string, DomainUser>({
    max: 500,
    ttl: 5 * 60 * 1000,
    allowStale: false,
    updateAgeOnGet: false,
});

/**
 * Resolves a BetterAuth NanoID user → Domain UUID user via the authLinks bridge.
 * Results are cached in-memory (LRU, 5min TTL) to avoid per-request DB joins.
 */
export async function resolveDomainUser(authUserId: string): Promise<DomainUser | null> {
    // Check cache first
    const cached = domainUserCache.get(authUserId);
    if (cached) {
        globalLogger.debug({ authUserId, domainUserId: cached.id }, 'DomainUser: cache hit');
        return cached;
    }
    globalLogger.debug({ authUserId }, 'DomainUser: cache miss — querying DB');

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

    domainUserCache.set(authUserId, domainUser);
    globalLogger.debug({ authUserId, domainUserId: domainUser.id, roles: domainUser.roles }, 'DomainUser: resolved and cached');

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
