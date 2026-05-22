import { describe, expect, it } from 'vitest';

import { getInitials } from './initials';

describe('getInitials', () => {
    it('returns ? for empty / whitespace input', () => {
        expect(getInitials('')).toBe('?');
        expect(getInitials('   ')).toBe('?');
    });

    it('returns the first two chars upper-cased for a single token', () => {
        expect(getInitials('ada')).toBe('AD');
        expect(getInitials('Q')).toBe('Q');
        expect(getInitials('jane@example.com')).toBe('JA');
    });

    it('returns first + last initial for multi-token names', () => {
        expect(getInitials('Ada Lovelace')).toBe('AL');
        expect(getInitials('grace hopper')).toBe('GH');
    });

    it('skips middle tokens when the name has more than two parts', () => {
        expect(getInitials('Anna Banana Carmichael')).toBe('AC');
    });

    it('tolerates collapsed and surrounding whitespace', () => {
        expect(getInitials('  Ada   Lovelace  ')).toBe('AL');
    });
});
