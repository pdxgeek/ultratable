import { customAlphabet } from 'nanoid';

// Custom alphabet: lowercase + numbers, removing similar looking characters (no l, 1, i, o, 0)
// 32 chars: 23456789abcdefghjkmnpqrstuvwxyz
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const nanoid = customAlphabet(ALPHABET, 12);

export function generateId(prefix?: string): string {
    const id = nanoid();
    return prefix ? `${prefix}_${id}` : id;
}
