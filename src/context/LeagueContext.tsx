import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { League, LeagueSeason } from '../types';
import { fetchLeaguesHierarchical } from '../services/leagueRegistry';
import { database } from '../services/db';

interface LeagueContextType {
    activeLeague: League | null;
    activeSeason: LeagueSeason | null;
    availableLeagues: League[];
    availableSeasons: LeagueSeason[];
    activeLeagueKey: string; // This will now represent the Season ID
    setActiveLeagueKey: (key: string) => void;
    refreshLeagues: () => void;
    isLoading: boolean;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export function LeagueProvider({ children }: { children: ReactNode }) {
    const [availableLeagues, setAvailableLeagues] = useState<League[]>([]);
    const [availableSeasons, setAvailableSeasons] = useState<LeagueSeason[]>([]);
    const [activeLeagueKey, setActiveLeagueKeyState] = useState<string>(() => {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('ultratable_active_season') || '';
        }
        return '';
    });

    const [isLoading, setIsLoading] = useState(true);

    const refreshLeagues = useCallback(async () => {
        setIsLoading(true);
        try {
            const leagueList = await fetchLeaguesHierarchical();
            setAvailableLeagues(leagueList);

            const allSeasons: LeagueSeason[] = [];
            for (const l of leagueList) {
                const seasons = await database.getSeasonsForLeague(l.id);
                allSeasons.push(...seasons);
            }
            setAvailableSeasons(allSeasons);

            // Handle initial selection if empty OR invalid
            const isValid = allSeasons.some(s => s.id === activeLeagueKey);
            if ((activeLeagueKey === '' || !isValid) && allSeasons.length > 0) {
                const firstId = allSeasons[0].id;
                setActiveLeagueKeyState(firstId);
                localStorage.setItem('ultratable_active_season', firstId);
            }
        } catch (err) {
            console.error('Failed to fetch leagues:', err);
        } finally {
            setIsLoading(false);
        }
    }, [activeLeagueKey]); // activeLeagueKey only used for initial selection check

    useEffect(() => {
        refreshLeagues();
    }, []);

    // Derive active objects based on key and available data
    const activeSeason = useMemo(() =>
        availableSeasons.find(s => s.id === activeLeagueKey) || null
        , [availableSeasons, activeLeagueKey]);

    const activeLeague = useMemo(() =>
        activeSeason ? availableLeagues.find(l => l.id === activeSeason.leagueId) || null : null
        , [availableLeagues, activeSeason]);

    const setActiveLeagueKey = useCallback((key: string) => {
        setActiveLeagueKeyState(key);
        localStorage.setItem('ultratable_active_season', key);
    }, []);

    return (
        <LeagueContext.Provider value={{
            activeLeague,
            activeSeason,
            availableLeagues,
            availableSeasons,
            setActiveLeagueKey,
            activeLeagueKey,
            refreshLeagues,
            isLoading
        }}>
            {children}
        </LeagueContext.Provider>
    );
}

export function useLeague() {
    const context = useContext(LeagueContext);
    if (!context) {
        throw new Error('useLeague must be used within a LeagueProvider');
    }
    return context;
}
