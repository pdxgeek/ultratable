import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
        const show = false as boolean;
        expect(cn('base', show && 'hidden', 'visible')).toBe('base visible');
    });

    it('deduplicates tailwind conflicts', () => {
        expect(cn('p-4', 'p-8')).toBe('p-8');
    });

    it('handles undefined and null gracefully', () => {
        expect(cn('base', undefined, null, 'end')).toBe('base end');
    });
});
