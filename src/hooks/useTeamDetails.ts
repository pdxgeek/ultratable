import { useQuery } from '@tanstack/react-query';
import { fetchTeamDetails } from '../services/apiFootball';
import type { LeagueConfig } from '../types';

export function useTeamDetails(league: LeagueConfig, teamId: string | undefined) {
    return useQuery({
        queryKey: ['teamDetails', teamId, league.id, league.season],
        queryFn: async () => {
            if (!teamId) throw new Error('No teamId provided');
            return fetchTeamDetails(league, teamId);
        },
        enabled: !!teamId && !!league.id,
        staleTime: 1000 * 60 * 60, // 1 hour
        refetchOnWindowFocus: false,
    });
}
