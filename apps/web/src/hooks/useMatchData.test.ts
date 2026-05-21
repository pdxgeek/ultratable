/**
 * useMatchData — issue #52.
 *
 * The hook reads a fixture from urql and reshapes it for the Match page. The
 * non-trivial part is the timeline collapse:
 *
 *   - Two substitutions at the same minute on the same team are folded into
 *     a single "subst_group" event with both subs as children.
 *   - A third substitution at that same minute on that team joins the group.
 *   - Subs on different teams or different minutes stay separate.
 *   - Non-substitution events (Goals, Cards) are never folded.
 *
 * The home/away lineup pickers also need pinning: they index the lineups by
 * the team's `sourceId`, not its UUID.
 */
import type { MatchFixture, MatchLineup } from '../components/match/types';

import { renderHook } from '@testing-library/react';
import { useQuery } from 'urql';
import { describe, expect, it, vi } from 'vitest';

import { useMatchData } from './useMatchData';

vi.mock('urql', () => ({ useQuery: vi.fn() }));

function mockUrql(fixture: MatchFixture | null): void {
    vi.mocked(useQuery).mockReturnValue([
        { data: fixture ? { fixture } : null, fetching: false, error: undefined, stale: false },
        vi.fn(),
    ] as unknown as ReturnType<typeof useQuery>);
}

const baseTeam = (sourceId: number) => ({
    id: `t-${sourceId}`,
    name: `Team ${sourceId}`,
    shortName: `T${sourceId}`,
    logo: '',
    sourceId,
});

function buildFixture(opts: Partial<MatchFixture>): MatchFixture {
    return {
        id: 'f1',
        season: 2024,
        leagueSourceId: 39,
        scheduledAt: '2026-03-01T15:00:00Z',
        status: 'played',
        goalsHome: 2,
        goalsAway: 1,
        homeTeam: baseTeam(40),
        awayTeam: baseTeam(50),
        venue: null,
        events: [],
        lineups: [],
        ...opts,
    };
}

describe('useMatchData', () => {
    it('returns nulls / empty arrays when no fixture is loaded yet', () => {
        mockUrql(null);
        const { result } = renderHook(() => useMatchData('f1'));
        expect(result.current.fixture).toBeNull();
        expect(result.current.homeLineup).toBeNull();
        expect(result.current.awayLineup).toBeNull();
        expect(result.current.timelineEvents).toEqual([]);
    });

    it('passes pause=true when the fixture id is undefined (avoids the no-id query)', () => {
        mockUrql(null);
        renderHook(() => useMatchData(undefined));
        expect(useQuery).toHaveBeenCalledWith(
            expect.objectContaining({ pause: true, variables: { id: undefined } }),
        );
    });

    it('picks lineups by team sourceId, not UUID', () => {
        const homeLineup: MatchLineup = {
            teamSourceId: 40,
            teamName: 'Home',
            teamLogo: '',
            formation: '4-3-3',
            coachName: '',
            coachPhoto: '',
            startXI: [],
            substitutes: [],
        };
        const awayLineup: MatchLineup = { ...homeLineup, teamSourceId: 50, teamName: 'Away' };

        mockUrql(buildFixture({ lineups: [homeLineup, awayLineup] }));

        const { result } = renderHook(() => useMatchData('f1'));
        expect(result.current.homeLineup?.teamName).toBe('Home');
        expect(result.current.awayLineup?.teamName).toBe('Away');
    });

    it('returns null lineups when the fixture has no lineups array', () => {
        mockUrql(buildFixture({ lineups: [] }));
        const { result } = renderHook(() => useMatchData('f1'));
        expect(result.current.homeLineup).toBeNull();
        expect(result.current.awayLineup).toBeNull();
    });

    it('sorts events by minute, then extraMinute', () => {
        mockUrql(
            buildFixture({
                events: [
                    {
                        minute: 90,
                        extraMinute: 3,
                        teamId: 40,
                        playerName: 'Late',
                        assistName: null,
                        type: 'Goal',
                        detail: 'Normal Goal',
                        comments: null,
                    },
                    {
                        minute: 22,
                        extraMinute: null,
                        teamId: 50,
                        playerName: 'Early',
                        assistName: null,
                        type: 'Goal',
                        detail: 'Normal Goal',
                        comments: null,
                    },
                    {
                        minute: 90,
                        extraMinute: 1,
                        teamId: 40,
                        playerName: 'StoppageA',
                        assistName: null,
                        type: 'Goal',
                        detail: 'Normal Goal',
                        comments: null,
                    },
                ],
            }),
        );
        const { result } = renderHook(() => useMatchData('f1'));
        expect(result.current.timelineEvents.map((e) => e.playerName)).toEqual([
            'Early',
            'StoppageA',
            'Late',
        ]);
    });

    it('collapses two same-minute, same-team substitutions into one subst_group', () => {
        const subOff = {
            minute: 60,
            extraMinute: null,
            teamId: 40,
            playerName: 'Sub A',
            assistName: null,
            type: 'subst',
            detail: 'Substitution 1',
            comments: null,
        };
        const subOn = { ...subOff, playerName: 'Sub B', detail: 'Substitution 2' };

        mockUrql(buildFixture({ events: [subOff, subOn] }));
        const { result } = renderHook(() => useMatchData('f1'));

        expect(result.current.timelineEvents).toHaveLength(1);
        const group = result.current.timelineEvents[0];
        expect(group.type).toBe('subst_group');
        expect(group.subs).toHaveLength(2);
    });

    it('appends a third substitution at the same minute/team to the existing group', () => {
        const subA = {
            minute: 75,
            extraMinute: null,
            teamId: 40,
            playerName: 'A',
            assistName: null,
            type: 'subst',
            detail: '',
            comments: null,
        };
        const subB = { ...subA, playerName: 'B' };
        const subC = { ...subA, playerName: 'C' };

        mockUrql(buildFixture({ events: [subA, subB, subC] }));
        const { result } = renderHook(() => useMatchData('f1'));

        expect(result.current.timelineEvents).toHaveLength(1);
        expect(result.current.timelineEvents[0].type).toBe('subst_group');
        expect(result.current.timelineEvents[0].subs?.map((s) => s.playerName)).toEqual([
            'A',
            'B',
            'C',
        ]);
    });

    it('does NOT collapse substitutions across different teams at the same minute', () => {
        const homeSub = {
            minute: 60,
            extraMinute: null,
            teamId: 40,
            playerName: 'Home A',
            assistName: null,
            type: 'subst',
            detail: '',
            comments: null,
        };
        const awaySub = { ...homeSub, teamId: 50, playerName: 'Away A' };

        mockUrql(buildFixture({ events: [homeSub, awaySub] }));
        const { result } = renderHook(() => useMatchData('f1'));

        expect(result.current.timelineEvents).toHaveLength(2);
        expect(result.current.timelineEvents.every((e) => e.type === 'subst')).toBe(true);
    });

    it('does NOT fold non-substitution events even at the same minute/team', () => {
        const goal = {
            minute: 60,
            extraMinute: null,
            teamId: 40,
            playerName: 'Scorer',
            assistName: null,
            type: 'Goal',
            detail: 'Normal Goal',
            comments: null,
        };
        const card = { ...goal, type: 'Card', detail: 'Yellow Card', playerName: 'Booked' };

        mockUrql(buildFixture({ events: [goal, card] }));
        const { result } = renderHook(() => useMatchData('f1'));
        expect(result.current.timelineEvents).toHaveLength(2);
        expect(result.current.timelineEvents.every((e) => e.type !== 'subst_group')).toBe(true);
    });
});
