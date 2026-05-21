/**
 * useStandings — issue #52.
 *
 * The hook compiles a live standings table from Dexie. The compilation itself
 * is covered by dataCompiler.test.ts; what's pinned here is the *orchestration*
 * the hook is responsible for:
 *
 *   - Playoff matches (gameweek === null) are excluded from the league table.
 *   - Only teams that actually appear in this season's fixtures are loaded
 *     (not every team in Dexie).
 *   - Season metadata (deductions, zones) and league metadata (zone defaults)
 *     flow through to compileStandings.
 *   - season.rankingCriteria from the DB beats the options.criteria default.
 *   - When the season is missing from Dexie, the hook returns the empty-state
 *     fallback shape (no crash, no data).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import 'fake-indexeddb/auto';

import type { Fixture } from '../db';

import { renderHook, waitFor } from '@testing-library/react';

import { db } from '../db';
import { useStandings } from './useStandings';

// Spy on compileStandings so we can assert what the hook actually passes through.
// We don't replace it — the upstream test (dataCompiler.test.ts) pins the math.
vi.mock('../logic/dataCompiler', async (importActual) => {
    const actual = await importActual<typeof import('../logic/dataCompiler')>();
    return {
        ...actual,
        compileStandings: vi.fn(actual.compileStandings),
    };
});

function makeFixture(o: Partial<Fixture> & { id: string }): Fixture {
    return {
        seasonId: 'season-1',
        homeTeamId: 'home',
        awayTeamId: 'away',
        scheduledAt: '2024-01-01T12:00:00Z',
        status: 'played',
        goalsHome: 1,
        goalsAway: 0,
        gameweek: 1,
        updatedAt: '2026-02-23T10:00:00Z',
        ...o,
    };
}

describe('useStandings', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await db.fixtures.clear();
        await db.teams.clear();
        await db.seasons.clear();
        await db.leagues.clear();
    });

    it('returns empty arrays + isLoading false when the season is missing', async () => {
        const { result } = renderHook(() => useStandings('does-not-exist'));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.standings).toEqual([]);
        expect(result.current.fixtures).toEqual([]);
        expect(result.current.teamsMap.size).toBe(0);
        expect(result.current.season).toBeUndefined();
    });

    it('excludes playoff fixtures (gameweek === null) from the table', async () => {
        await db.leagues.add({
            id: 'l1',
            sourceId: 39,
            name: 'PL',
            slug: 'pl',
            updatedAt: '2026-02-23T10:00:00Z',
        });
        await db.seasons.add({
            id: 'season-1',
            leagueId: 'l1',
            year: 2024,
            updatedAt: '2026-02-23T10:00:00Z',
        });
        await db.teams.bulkAdd([
            { id: 'home', name: 'Home FC', updatedAt: '2026-02-23T10:00:00Z' },
            { id: 'away', name: 'Away FC', updatedAt: '2026-02-23T10:00:00Z' },
        ]);
        await db.fixtures.bulkAdd([
            makeFixture({ id: 'gw1', gameweek: 1 }),
            makeFixture({ id: 'gw2', gameweek: 2 }),
            makeFixture({ id: 'playoff', gameweek: null }),
        ]);

        const { result } = renderHook(() => useStandings('season-1'));

        await waitFor(() => expect(result.current.fixtures).toHaveLength(2));
        // The hook's `fixtures` is the filtered set passed into compileStandings.
        expect(result.current.fixtures.map((f) => f.id).sort()).toEqual(['gw1', 'gw2']);
    });

    it('only loads teams that appear in this season fixtures, not every team in Dexie', async () => {
        await db.leagues.add({
            id: 'l1',
            sourceId: 39,
            name: 'PL',
            slug: 'pl',
            updatedAt: '2026-02-23T10:00:00Z',
        });
        await db.seasons.add({
            id: 'season-1',
            leagueId: 'l1',
            year: 2024,
            updatedAt: '2026-02-23T10:00:00Z',
        });
        await db.teams.bulkAdd([
            { id: 'home', name: 'Home', updatedAt: '2026-02-23T10:00:00Z' },
            { id: 'away', name: 'Away', updatedAt: '2026-02-23T10:00:00Z' },
            // This team belongs to a different season — must not appear in the map.
            { id: 'other', name: 'Other', updatedAt: '2026-02-23T10:00:00Z' },
        ]);
        await db.fixtures.add(makeFixture({ id: 'f1', homeTeamId: 'home', awayTeamId: 'away' }));

        const { result } = renderHook(() => useStandings('season-1'));

        await waitFor(() => expect(result.current.teamsMap.size).toBe(2));
        expect(result.current.teamsMap.has('home')).toBe(true);
        expect(result.current.teamsMap.has('away')).toBe(true);
        expect(result.current.teamsMap.has('other')).toBe(false);
    });

    it('returns empty teamsMap (and skips the teams query) when no fixtures match', async () => {
        await db.seasons.add({
            id: 'season-1',
            leagueId: 'l1',
            year: 2024,
            updatedAt: '2026-02-23T10:00:00Z',
        });

        const { result } = renderHook(() => useStandings('season-1'));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.teamsMap.size).toBe(0);
        expect(result.current.standings).toEqual([]);
    });

    it('forwards season + league metadata (deductions, zones) into compileStandings', async () => {
        const { compileStandings } = await import('../logic/dataCompiler');
        await db.leagues.add({
            id: 'l1',
            sourceId: 39,
            name: 'PL',
            slug: 'pl',
            updatedAt: '2026-02-23T10:00:00Z',
            metadata: { promotion: [1, 2], relegation: [18, 19, 20] },
        });
        await db.seasons.add({
            id: 'season-1',
            leagueId: 'l1',
            year: 2024,
            updatedAt: '2026-02-23T10:00:00Z',
            metadata: {
                deductions: [{ teamId: 'home', points: 4, reason: 'breach' }],
                playoffs: [3, 4, 5],
                // No zone override → league.metadata.promotion wins.
            },
        });
        await db.teams.bulkAdd([
            { id: 'home', name: 'Home', updatedAt: '2026-02-23T10:00:00Z' },
            { id: 'away', name: 'Away', updatedAt: '2026-02-23T10:00:00Z' },
        ]);
        await db.fixtures.add(makeFixture({ id: 'f1' }));

        const { result } = renderHook(() => useStandings('season-1'));

        await waitFor(() => expect(result.current.fixtures).toHaveLength(1));

        expect(compileStandings).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(Array),
            expect.objectContaining({
                deductions: [{ teamId: 'home', points: 4, reason: 'breach' }],
                zones: {
                    promotion: [1, 2],
                    playoffs: [3, 4, 5],
                    relegation: [18, 19, 20],
                },
            }),
        );
    });

    it('uses season.rankingCriteria when present, overriding options.criteria', async () => {
        const { compileStandings } = await import('../logic/dataCompiler');
        const seasonCriteria = [{ name: 'Points', logicType: 'points', id: 'standard_pts' }];
        await db.seasons.add({
            id: 'season-1',
            leagueId: 'l1',
            year: 2024,
            updatedAt: '2026-02-23T10:00:00Z',
            rankingCriteria: seasonCriteria,
        });
        await db.teams.add({ id: 'home', name: 'Home', updatedAt: '2026-02-23T10:00:00Z' });
        await db.fixtures.add(makeFixture({ id: 'f1' }));

        const { result } = renderHook(() =>
            useStandings('season-1', {
                criteria: [{ name: 'Goal Diff', logicType: 'goalDiff' }],
            }),
        );

        await waitFor(() => expect(result.current.fixtures).toHaveLength(1));

        expect(compileStandings).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(Array),
            expect.objectContaining({ criteria: seasonCriteria }),
        );
    });

    it('exposes lastUpdated as an ISO string when data is loaded', async () => {
        await db.seasons.add({
            id: 'season-1',
            leagueId: 'l1',
            year: 2024,
            updatedAt: '2026-02-23T10:00:00Z',
        });

        const { result } = renderHook(() => useStandings('season-1'));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
