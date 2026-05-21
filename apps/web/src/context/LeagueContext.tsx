import type { League, Season } from '../db';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { gql } from 'urql';

import { client } from '../api/client';
import { db } from '../db';
import { useDeltaSync } from '../hooks/useDeltaSync';

interface LeagueContextType {
    activeLeague: League | null;
    activeSeason: Season | null;
    availableLeagues: League[];
    availableSeasons: Season[];
    setActiveSeasonId: (id: string) => void;
    isLoading: boolean;
    isSyncing: boolean;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

const LIST_LEAGUES_QUERY = gql`
    query ListLeagues {
        leagues {
            id
            sourceId
            name
            slug
            country
            logo
            updatedAt
            configJson
            seasons {
                id
                leagueId
                year
                updatedAt
                configJson
                rankingCriteria {
                    id
                    name
                    logicType
                }
            }
        }
    }
`;

export function LeagueProvider({ children }: { children: React.ReactNode }) {
    const [activeSeasonId, setActiveSeasonIdState] = useState<string>(() => {
        return localStorage.getItem('ultratable_active_season_id') || '';
    });

    const { sync, isSyncing } = useDeltaSync();

    // 1. Live queries for Dexie data
    const leaguesResult = useLiveQuery(() => db.leagues.toArray());
    const seasonsResult = useLiveQuery(() => db.seasons.toArray());

    const leagues = useMemo(() => leaguesResult || [], [leaguesResult]);
    const seasons = useMemo(() => seasonsResult || [], [seasonsResult]);

    const activeSeason = useMemo(
        () => seasons.find((s) => s.id === activeSeasonId) || null,
        [seasons, activeSeasonId],
    );

    const activeLeague = useMemo(
        () => (activeSeason ? leagues.find((l) => l.id === activeSeason.leagueId) || null : null),
        [leagues, activeSeason],
    );

    // 2. Bootstrap: Fetch leagues/seasons from API and store in Dexie
    useEffect(() => {
        const bootstrap = async () => {
            try {
                const result = await client.query(LIST_LEAGUES_QUERY, {}).toPromise();

                if (result.error) {
                    console.error('GraphQL Bootstrap Error:', result.error);
                }

                if (result.data?.leagues) {
                    const apiLeagues = result.data.leagues;

                    await db.transaction('rw', [db.leagues, db.seasons], async () => {
                        for (const l of apiLeagues) {
                            await db.leagues.put({
                                id: l.id,
                                sourceId: l.sourceId,
                                name: l.name,
                                slug: l.slug,
                                country: l.country,
                                logo: l.logo,
                                updatedAt: l.updatedAt,
                                metadata: l.configJson ? JSON.parse(l.configJson) : {},
                            });
                            for (const s of l.seasons) {
                                await db.seasons.put({
                                    id: s.id,
                                    leagueId: s.leagueId,
                                    year: s.year,
                                    updatedAt: s.updatedAt,
                                    rankingCriteria: s.rankingCriteria,
                                    metadata: s.configJson ? JSON.parse(s.configJson) : {},
                                });
                            }
                        }
                    });

                    // Set initial selection if empty
                    if (
                        !activeSeasonId &&
                        apiLeagues.length > 0 &&
                        apiLeagues[0].seasons.length > 0
                    ) {
                        const firstId = apiLeagues[0].seasons[0].id;
                        setActiveSeasonIdState(firstId);
                        localStorage.setItem('ultratable_active_season_id', firstId);
                    }
                }
            } catch (err) {
                console.error('Failed to bootstrap leagues:', err);
            }
        };
        bootstrap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 3. Auto-sync when active season changes
    useEffect(() => {
        if (activeSeason) {
            // Initial sync on season change
            sync(activeSeason.id);

            // Set up a 5-minute heartbeat to poll for live fixtures
            const intervalId = setInterval(
                () => {
                    sync(activeSeason.id);
                },
                5 * 60 * 1000,
            );

            return () => clearInterval(intervalId);
        }
    }, [activeSeasonId, activeSeason, sync]);

    const setActiveSeasonId = useCallback((id: string) => {
        setActiveSeasonIdState(id);
        localStorage.setItem('ultratable_active_season_id', id);
    }, []);

    return (
        <LeagueContext.Provider
            value={{
                activeLeague,
                activeSeason,
                availableLeagues: leagues,
                availableSeasons: seasons,
                setActiveSeasonId,
                isLoading: leagues.length === 0,
                isSyncing,
            }}
        >
            {children}
        </LeagueContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLeague() {
    const context = useContext(LeagueContext);
    if (!context) throw new Error('useLeague must be used within a LeagueProvider');
    return context;
}
