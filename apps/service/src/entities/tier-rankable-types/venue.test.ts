/**
 * Venue recipe unit tests. Pins the projection contract for venues —
 * unlike coaches, venues are first-class entities so the natural key
 * is the venue UUID itself, and teamId is intentionally null (venues
 * don't belong to a team).
 */
import { describe, expect, it } from 'vitest';

import type { RecipeContext } from './recipe';
import { venueRecipe, type VenueSourceRow } from './venue';

const VENUE_ID = '00000000-0000-0000-0000-0000000000a1';
const NOOP_CTX: RecipeContext = {
    // Venue recipe doesn't touch reverse-lookup. The fact that this
    // would throw if called proves the recipe is decoupled from team
    // resolution.
    resolveTeamIdsBySource: async () => {
        throw new Error('venue recipe must not call resolveTeamIdsBySource');
    },
};

function source(overrides: Partial<VenueSourceRow> = {}): VenueSourceRow {
    return {
        venueId: VENUE_ID,
        name: 'Old Trafford',
        image: 'https://example.com/old-trafford.png',
        city: 'Manchester',
        capacity: 74310,
        ...overrides,
    };
}

describe('venueRecipe', () => {
    it('registers as the venue recipe over venue rows', () => {
        expect(venueRecipe.id).toBe('venue');
        expect(venueRecipe.name).toBe('Venue');
        expect(venueRecipe.sourceType).toBe('venue');
    });

    it('projects all required item fields with venueId as the natural key', async () => {
        const result = await venueRecipe.project(source(), NOOP_CTX);
        expect(result).toEqual({
            name: 'Old Trafford',
            imageUrl: 'https://example.com/old-trafford.png',
            teamId: null,
            naturalKey: VENUE_ID,
            sourceType: 'venue',
            sourceId: VENUE_ID,
            sourcePath: null,
        });
    });

    it('trims the name but leaves the natural key as the bare venueId', async () => {
        const result = await venueRecipe.project(
            source({ name: '  Old Trafford  ' }),
            NOOP_CTX,
        );
        expect(result.name).toBe('Old Trafford');
        expect(result.naturalKey).toBe(VENUE_ID);
    });

    it('passes through null image gracefully', async () => {
        const result = await venueRecipe.project(source({ image: null }), NOOP_CTX);
        expect(result.imageUrl).toBeNull();
    });

    it('throws when the venue has no name', async () => {
        await expect(
            venueRecipe.project(source({ name: '   ' }), NOOP_CTX),
        ).rejects.toThrow(/no name/);
    });
});
