import type { MatchEvent, MatchFixture, MatchLineup } from '../components/match/types';

import { useMemo } from 'react';
import { useQuery } from 'urql';

import { MATCH_QUERY } from '../components/match/types';

interface UseMatchDataResult {
    fixture: MatchFixture | null;
    homeLineup: MatchLineup | null;
    awayLineup: MatchLineup | null;
    timelineEvents: MatchEvent[];
    fetching: boolean;
    error: Error | undefined;
}

export function useMatchData(id: string | undefined): UseMatchDataResult {
    const [{ data, fetching, error }] = useQuery({
        query: MATCH_QUERY,
        variables: { id },
        pause: !id,
    });

    const fixture: MatchFixture | null = data?.fixture ?? null;

    const homeLineup = useMemo(() => {
        if (!fixture?.lineups || !fixture.homeTeam) return null;
        return fixture.lineups.find((l) => l.teamSourceId === fixture.homeTeam.sourceId) ?? null;
    }, [fixture]);

    const awayLineup = useMemo(() => {
        if (!fixture?.lineups || !fixture.awayTeam) return null;
        return fixture.lineups.find((l) => l.teamSourceId === fixture.awayTeam.sourceId) ?? null;
    }, [fixture]);

    const timelineEvents = useMemo<MatchEvent[]>(() => {
        if (!fixture?.events) return [];
        const rawEvents = [...fixture.events].sort((a, b) => {
            if (a.minute === b.minute) {
                return (a.extraMinute || 0) - (b.extraMinute || 0);
            }
            return a.minute - b.minute;
        });

        const collapsed: MatchEvent[] = [];
        for (const evt of rawEvents) {
            if (evt.type === 'subst') {
                const prev = collapsed.length > 0 ? collapsed[collapsed.length - 1] : null;
                if (
                    prev &&
                    prev.minute === evt.minute &&
                    prev.teamId === evt.teamId &&
                    prev.type === 'subst_group' &&
                    prev.subs
                ) {
                    prev.subs.push(evt);
                } else if (
                    prev &&
                    prev.minute === evt.minute &&
                    prev.teamId === evt.teamId &&
                    prev.type === 'subst'
                ) {
                    const group: MatchEvent = {
                        ...prev,
                        type: 'subst_group',
                        subs: [prev, evt],
                    };
                    collapsed[collapsed.length - 1] = group;
                } else {
                    collapsed.push(evt);
                }
            } else {
                collapsed.push(evt);
            }
        }
        return collapsed;
    }, [fixture]);

    return { fixture, homeLineup, awayLineup, timelineEvents, fetching, error };
}
