import { describe, it, expect } from 'vitest';
import { generateId, generateDeterministicId, calculateHash, generateContentId, generateIdWithPrefix } from './idUtils';

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

    describe('calculateHash', () => {
        it('returns a SHA-256 hex string', async () => {
            const hash = await calculateHash(Buffer.from('hello'));
            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[0-9a-f]+$/);
        });

        it('is deterministic', async () => {
            const a = await calculateHash(Buffer.from('same-data'));
            const b = await calculateHash(Buffer.from('same-data'));
            expect(a).toBe(b);
        });

        it('differs for different inputs', async () => {
            const a = await calculateHash(Buffer.from('data-a'));
            const b = await calculateHash(Buffer.from('data-b'));
            expect(a).not.toBe(b);
        });
    });

    describe('generateContentId', () => {
        it('produces a deterministic 12-char ID from buffer content', async () => {
            const a = await generateContentId(Buffer.from('some-image-data'));
            const b = await generateContentId(Buffer.from('some-image-data'));
            expect(a).toBe(b);
            expect(a).toHaveLength(12);
        });
    });

    describe('generateIdWithPrefix', () => {
        it('prefixes the generated ID', () => {
            const id = generateIdWithPrefix('team');
            expect(id).toMatch(/^team_[a-z0-9]{12}$/);
        });
    });
});
