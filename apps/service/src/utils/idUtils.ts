import { customAlphabet } from 'nanoid';
import crypto from 'crypto';

// Custom alphabet: Base32-like (lowercase + numbers, removing similar looking characters: no l, 1, i, o, 0)
// 30 chars for better distribution: 23456789abcdefghjkmnpqrstuvwxyz
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

// Generate unique IDs - pure Base32-like NanoIDs
const nanoid = customAlphabet(ALPHABET, 12);

export function generateId(): string {
    return nanoid();
}

// Generate deterministic NanoID from a seed string (for cache consistency)
export function generateDeterministicId(seed: string): string {
    // Create a simple hash from the seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Use hash as seed for deterministic random
    const seededRandom = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    };

    // Generate 12 characters deterministically
    let id = '';
    let currentSeed = Math.abs(hash);
    for (let i = 0; i < 12; i++) {
        currentSeed = Math.abs(currentSeed * 9301 + 49297) % 233280;
        const rand = seededRandom(currentSeed);
        const index = Math.floor(rand * ALPHABET.length);
        id += ALPHABET[index];
    }

    return id;
}

// SHA-256 hashing for binary deduplication Node.js
export async function calculateHash(buffer: Buffer): Promise<string> {
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
}

/**
 * Generates a deterministic NanoID from a buffer's content.
 * This is the primary ID used for physical file storage.
 */
export async function generateContentId(buffer: Buffer): Promise<string> {
    const hash = await calculateHash(buffer);
    return generateDeterministicId(hash);
}

// Legacy support: generate ID with prefix (deprecated - use pure IDs instead)
export function generateIdWithPrefix(prefix: string): string {
    return `${prefix}_${nanoid()}`;
}
