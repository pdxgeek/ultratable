import { customAlphabet } from 'nanoid';

// Custom alphabet: Base32-like (lowercase + numbers, removing similar looking characters: no l, 1, i, o, 0)
// 30 chars for better distribution: 23456789abcdefghjkmnpqrstuvwxyz
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

// Generate unique IDs - pure Base32-like NanoIDs
const nanoid = customAlphabet(ALPHABET, 12);

export function generateId(): string {
    return nanoid();
}

// Legacy support: generate ID with prefix (deprecated - use pure IDs instead)
export function generateIdWithPrefix(prefix: string): string {
    return `${prefix}_${nanoid()}`;
}
