import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTeams, fetchFixtures } from '../services/apiFootball';
import type { League, LeagueSeason } from '../types';

export function useLeagueData(
    league: League | null,
    season: LeagueSeason | null,
    options: { enabled?: boolean } = {}
) {
    const isEnabled = options.enabled !== false && !!league && !!season;

    // Fetch Teams
    const teamsQuery = useQuery({
        queryKey: ['teams', season?.id],
        enabled: isEnabled,
        queryFn: async () => {
            const config = {
                id: league?.id || '0',
                season: season?.season || 0,
                integrations: league?.integrations,
                externalReferences: season?.externalReferences || league?.externalReferences
            } as any;

            const data = await fetchTeams(config);
            return data;
        },
        staleTime: 1000 * 60 * 60, // 1 hour
        refetchOnWindowFocus: false,
    });

    // Fetch Fixtures
    const fixturesQuery = useQuery({
        queryKey: ['fixtures', season?.id],
        enabled: isEnabled,
        queryFn: () => {
            const config = {
                id: league?.id || '0',
                season: season?.season || 0,
                integrations: league?.integrations,
                externalReferences: season?.externalReferences || league?.externalReferences
            } as any;
            return fetchFixtures(config);
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
    });

    const teamsRefetch = teamsQuery.refetch;
    const fixturesRefetch = fixturesQuery.refetch;

    return {
        teams: teamsQuery.data,
        fixtures: fixturesQuery.data,
        isLoading: teamsQuery.isLoading || fixturesQuery.isLoading,
        error: teamsQuery.error || fixturesQuery.error,
        refetch: useCallback(async (options?: { forceRefresh?: boolean }) => {
            if (options?.forceRefresh) {
                // We need to trigger the query with a forceRefresh flag
                // React Query doesn't easily support passing params to refetch that reach the queryFn
                // So we can use a trick: invalidate or just call the fetch functions manually if needed, 
                // but for now let's just use the standard refetch and rely on the fact that if we 
                // truly need a bypass, we'll implement a state-driven force flag.
                // Alternatively, we can just call the service functions directly here:
                const config = {
                    id: league?.id || '0',
                    season: season?.season || 0,
                    integrations: league?.integrations,
                    externalReferences: season?.externalReferences || league?.externalReferences
                } as any;
                await Promise.all([
                    fetchTeams(config, { forceRefresh: true }),
                    fetchFixtures(config, { forceRefresh: true })
                ]);
            }
            teamsRefetch();
            fixturesRefetch();
        }, [teamsRefetch, fixturesRefetch, league, season])
    };
}
