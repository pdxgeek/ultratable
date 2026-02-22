import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { fetchTeams, fetchFixtures } from '../services/apiFootball';
import { database } from '../services/db';
import type { League, LeagueSeason } from '../types';

export function useLeagueData(
    league: League | null,
    season: LeagueSeason | null,
    options: { enabled?: boolean } = {}
) {
    const isEnabled = options.enabled !== false && !!league && !!season;

    // Reactively read from Database
    const teams = useLiveQuery(
        async () => {
            if (!season?.id) return null;
            return database.getTeamsForSeason(season.id);
        },
        [season?.id]
    );

    const fixtures = useLiveQuery(
        async () => {
            if (!season?.id) return null;
            return database.getFixtures(season.id);
        },
        [season?.id]
    );

    const schedules = useLiveQuery(
        async () => {
            if (!season?.id) return null;
            return database.getSeasonSchedule(season.id);
        },
        [season?.id]
    );

    // Fetch Teams (Network trigger)
    const teamsQuery = useQuery({
        queryKey: ['teams_network', season?.id],
        enabled: isEnabled,
        queryFn: async () => {
            const config = {
                id: league?.id || '0',
                season: season?.season || 0,
                integrations: league?.integrations,
                externalReferences: season?.externalReferences || league?.externalReferences
            } as any;

            return fetchTeams(config);
        },
        staleTime: 1000 * 60 * 60,
        refetchOnWindowFocus: false,
    });

    // Fetch Fixtures (Network trigger)
    const fixturesQuery = useQuery({
        queryKey: ['fixtures_network', season?.id],
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
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    return {
        teams: teams || null,
        fixtures: fixtures || null,
        schedules: schedules || null,
        isLoading: (!teams || !fixtures) && (teamsQuery.isLoading || fixturesQuery.isLoading),
        error: teamsQuery.error || fixturesQuery.error,
        refetch: useCallback(async (options?: { forceRefresh?: boolean }) => {
            const leagueIdStr = league?.id || '0';
            const seasonNum = season?.season || 0;
            const integrations = league?.integrations;
            const externalReferences = season?.externalReferences || league?.externalReferences;

            const config = {
                id: leagueIdStr,
                season: seasonNum,
                integrations,
                externalReferences
            } as any;

            if (options?.forceRefresh) {
                await Promise.all([
                    fetchTeams(config, { forceRefresh: true }),
                    fetchFixtures(config, { forceRefresh: true })
                ]);
            }
            teamsQuery.refetch();
            fixturesQuery.refetch();
        }, [teamsQuery.refetch, fixturesQuery.refetch, league?.id, league?.integrations, season?.season, season?.externalReferences, league?.externalReferences])
    };
}
