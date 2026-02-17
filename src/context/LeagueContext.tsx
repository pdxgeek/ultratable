import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { DEFAULT_LEAGUE, type LeagueConfig } from '../types';
import { LEAGUES } from '../config';
import { fetchLeagues } from '../services/leagueRegistry';

interface LeagueContextType {
    activeLeague: LeagueConfig;
    availableLeagues: Record<string, LeagueConfig>;
    setActiveLeagueKey: (key: string) => void;
    activeLeagueKey: string;
    refreshLeagues: () => void;
    isLoading: boolean;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export function LeagueProvider({ children }: { children: ReactNode }) {
    const defaultKey = `${DEFAULT_LEAGUE.id}_${DEFAULT_LEAGUE.season}`;

    const [availableLeagues, setAvailableLeagues] = useState<Record<string, LeagueConfig>>(() => {
        const initial: Record<string, LeagueConfig> = {};
        Object.values(LEAGUES).forEach(l => {
            initial[`${l.id}_${l.season}`] = l as LeagueConfig;
        });
        return initial;
    });

    const [activeLeagueKey, setActiveLeagueKeyState] = useState<string>(() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('ultratable_active_league');
            if (saved) return saved;
        }
        return defaultKey;
    });

    const [isLoading, setIsLoading] = useState(true);

    const refreshLeagues = useCallback(async () => {
        try {
            const leagues = await fetchLeagues();
            setAvailableLeagues(leagues);
        } catch (err) {
            console.error('Failed to fetch leagues:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshLeagues();
    }, [refreshLeagues]);

    const setActiveLeagueKey = useCallback((key: string) => {
        setActiveLeagueKeyState(key);
        localStorage.setItem('ultratable_active_league', key);
    }, []);

    const activeLeague = availableLeagues[activeLeagueKey] || DEFAULT_LEAGUE;

    return (
        <LeagueContext.Provider value={{
            activeLeague,
            availableLeagues,
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
