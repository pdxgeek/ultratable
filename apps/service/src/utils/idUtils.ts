import { customAlphabet } from 'nanoid';

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
        hash = (hash << 5) - hash + char;
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
