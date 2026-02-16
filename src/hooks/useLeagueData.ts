import { useQuery } from '@tanstack/react-query';
import { fetchTeams, fetchFixtures } from '../services/apiFootball';
import type { LeagueConfig } from '../types';

export function useLeagueData(league: LeagueConfig) {
    const { id, season } = league;
    const leagueKey = `${id}_${season}`;

    // Fetch Teams
    const teamsQuery = useQuery({
        queryKey: ['teams', leagueKey],
        queryFn: async () => {
            const data = await fetchTeams(league);
            console.log('[useLeagueData] Fetched teams:', data.length, data[0]);
            return data;
        },
        staleTime: 1000 * 60 * 60, // 1 hour
        refetchOnWindowFocus: false,
    });

    // Fetch Fixtures
    const fixturesQuery = useQuery({
        queryKey: ['fixtures', leagueKey],
        queryFn: () => fetchFixtures(league),
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
    });


    return {
        teams: teamsQuery.data,
        fixtures: fixturesQuery.data,
        isLoading: teamsQuery.isLoading || fixturesQuery.isLoading,
        error: teamsQuery.error || fixturesQuery.error,
        refetch: () => {
            teamsQuery.refetch();
            fixturesQuery.refetch();
        }
    };
}
