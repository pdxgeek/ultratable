import { describe, expect, it } from 'vitest';

import { SeasonConfigSchema } from './seasonConfig';

describe('SeasonConfigSchema', () => {
    it('accepts the known fields', () => {
        const result = SeasonConfigSchema.safeParse({
            promotion: [1, 2],
            playoffs: [3, 4, 5, 6],
            relegation: [18, 19, 20],
            deductions: [{ teamId: 'team-uuid', points: -6, reason: 'FFP breach' }],
            rankingCriteria: ['standard_pts', 'goal_diff', 'goals_for'],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.promotion).toEqual([1, 2]);
            expect(result.data.deductions?.[0].teamId).toBe('team-uuid');
        }
    });

    it('accepts an empty object (all fields optional)', () => {
        const result = SeasonConfigSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('rejects unknown top-level keys', () => {
        const result = SeasonConfigSchema.safeParse({
            promotion: [1],
            rogueField: 'definitely-not-allowed',
        });
        expect(result.success).toBe(false);
    });

    it('rejects non-integer table positions', () => {
        const result = SeasonConfigSchema.safeParse({ promotion: [1.5] });
        expect(result.success).toBe(false);
    });

    it('rejects zero or negative table positions', () => {
        const result = SeasonConfigSchema.safeParse({ relegation: [0, -1] });
        expect(result.success).toBe(false);
    });

    it('rejects malformed deduction entries', () => {
        const result = SeasonConfigSchema.safeParse({
            deductions: [{ teamId: '', points: 0, reason: 'bad' }],
        });
        expect(result.success).toBe(false);
    });

    it('rejects oversize arrays', () => {
        const huge = Array.from({ length: 200 }, (_, i) => i + 1);
        const result = SeasonConfigSchema.safeParse({ promotion: huge });
        expect(result.success).toBe(false);
    });
});
