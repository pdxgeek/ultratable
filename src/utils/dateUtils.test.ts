import { describe, it, expect } from 'vitest';
import { formatMatchTime, formatMatchDate, formatFullDateTime } from '../utils/dateUtils';

describe('dateUtils', () => {
    // Note: Tests run in the environment's timezone.
    // For specific timezone testing, we might need to mock the Date object or timezone.
    // Assuming local timezone for simplicity as implementation relies on toLocaleString.

    it('formats match time correctly', () => {
        const date = new Date('2024-05-12T14:30:00.000Z');
        // JSDOM uses UTC by default, so it might output 14:30 or 15:30 depending on env settings.
        // But with 'en-GB' and UTC input, let's just check the format.
        // Actually, JSDOM usually runs in UTC or system local.
        // Assuming system local for user is likely UTC-8 (PST), so 14:30 UTC -> 06:30 or 07:30.
        // Let's just check the HH:MM format which won't break on timezone offset, just structure.
        const formatted = formatMatchTime(date.toISOString());
        expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    });

    it('formats match date correctly', () => {
        const date = new Date('2024-05-12T14:30:00.000Z');
        const formatted = formatMatchDate(date.toISOString());
        // en-GB format for "Sun, May 12" -> "Sun 12 May"
        // Wait, "Sun 12 May" is the expected output with { weekday: 'short', day: 'numeric', month: 'short' } in 'en-GB'
        // Let's verify standard output. 
        expect(formatted).toMatch(/^[A-Za-z]{3} \d{1,2} [A-Za-z]{3}$/);
    });

    it('formats full date time correctly', () => {
        const date = new Date('2024-05-12T14:30:00.000Z');
        const formatted = formatFullDateTime(date.toISOString());
        expect(formatted).toMatch(/^[A-Za-z]{3} \d{1,2} [A-Za-z]{3} \d{2}:\d{2}$/);
    });
});
