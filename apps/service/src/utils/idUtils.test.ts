import { describe, expect, it } from 'vitest';

import { generateDeterministicId, generateId } from './idUtils';

describe('idUtils', () => {
    describe('generateId', () => {
        it('produces a 12-character string', () => {
            const id = generateId();
            expect(id).toHaveLength(12);
        });

        it('uses only valid Base32-like characters', () => {
            const validChars = '23456789abcdefghjkmnpqrstuvwxyz';
            for (let i = 0; i < 50; i++) {
                const id = generateId();
                for (const char of id) {
                    expect(validChars).toContain(char);
                }
            }
        });

        it('produces unique IDs', () => {
            const ids = new Set(Array.from({ length: 100 }, () => generateId()));
            expect(ids.size).toBe(100);
        });
    });

    describe('generateDeterministicId', () => {
        it('produces a 12-character string', () => {
            expect(generateDeterministicId('test-seed')).toHaveLength(12);
        });

        it('produces the same result for the same seed', () => {
            const a = generateDeterministicId('my-seed');
            const b = generateDeterministicId('my-seed');
            expect(a).toBe(b);
        });

        it('produces different results for different seeds', () => {
            const a = generateDeterministicId('seed-a');
            const b = generateDeterministicId('seed-b');
            expect(a).not.toBe(b);
        });
    });
});
