import { useState, useEffect } from 'react';
import { checkQuota } from '../services/apiFootball';
import { getCacheAge } from '../services/cache';

import type { LeagueConfig } from '../types';

interface SyncBarProps {
    leagueName?: string;
    leagueId: string; // Changed to string key
    season?: number;
    syncing: boolean;
    onSync: () => void;
    onLeagueChange: (leagueKey: string) => void;
    leagues?: Record<string, LeagueConfig>;
}

export default function SyncBar({
    // leagueName,
    leagueId,
    // season,
    syncing,
    onSync,
    onLeagueChange,
    leagues = {},
}: SyncBarProps) {
    const [quota, setQuota] = useState<{ current: number; limit: number } | null>(
        null
    );
    const [cacheAge, setCacheAge] = useState<number | null>(null);

    useEffect(() => {
        checkQuota().then(setQuota);
    }, [syncing]);

    // Construct cache key using the actual ID and Season from the current league config
    const currentLeague = leagues[leagueId];
    const cacheKey = currentLeague
        ? `fixtures_${currentLeague.id}_${currentLeague.season}`
        : '';

    useEffect(() => {
        if (cacheKey) {
            getCacheAge(cacheKey).then(setCacheAge);
        }
    }, [cacheKey]);

    const lastSyncText = cacheAge
        ? formatAge(cacheAge)
        : 'Never synced';

    const handleLeagueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onLeagueChange(e.target.value);
    };

    return (
        <div className="sync-bar">
            <div className="sync-bar__left">
                <div className="sync-bar__title">
                    <span className="sync-bar__icon">🏆</span>
                    <select
                        className="sync-bar__league-select"
                        value={leagueId}
                        onChange={handleLeagueChange}
                    >
                        {Object.entries(leagues).map(([key, l]) => (
                            <option key={key} value={key}>
                                {l.name} ({l.season})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="sync-bar__right">
                <div className="sync-bar__meta">
                    <span className="sync-bar__last-sync" title="Last data sync">
                        🕐 {lastSyncText}
                    </span>
                </div>
                <button
                    className="sync-bar__btn"
                    onClick={onSync}
                    disabled={syncing}
                    title="Fetch latest data from API"
                >
                    {syncing ? (
                        <>
                            <span className="sync-bar__spinner" /> Syncing…
                        </>
                    ) : (
                        <>🔄 Refresh Data</>
                    )}
                </button>
            </div>
        </div>
    );
}

function formatAge(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
