import { useState, useEffect } from 'react';
import { checkQuota } from '../services/apiFootball';
import { getCacheAge } from '../services/cache';
import { useLeague } from '../context/LeagueContext';


export default function SyncBar({
    syncing,
    onSync,
}: { syncing: boolean; onSync: () => void }) {
    const {
        activeLeague,
        activeSeason,
        availableLeagues,
        availableSeasons,
        activeLeagueKey,
        setActiveLeagueKey: onLeagueChange
    } = useLeague();

    const [, setQuota] = useState<{ current: number; limit: number } | null>(null);
    const [cacheAge, setCacheAge] = useState<number | null>(null);

    useEffect(() => {
        checkQuota().then(setQuota);
    }, [syncing]);

    // Construct cache key using the external remote ID for API-Football
    const remoteId = activeLeague?.externalReferences[0]?.remoteId || '0';
    const seasonYear = activeSeason?.season || 0;
    const cacheKey = remoteId && seasonYear ? `fixtures_${remoteId}_${seasonYear}` : '';

    useEffect(() => {
        if (cacheKey) {
            getCacheAge(cacheKey).then(setCacheAge);
        }
    }, [cacheKey]);

    const lastSyncText = cacheAge ? formatAge(cacheAge) : 'Never synced';

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
                        value={activeLeagueKey}
                        onChange={handleLeagueChange}
                    >
                        {availableSeasons.map(s => {
                            const leagueName = availableLeagues.find(l => l.id === s.leagueId)?.commonName || 'Unknown League';
                            return (
                                <option key={s.id} value={s.id}>
                                    {leagueName} — {s.season}
                                </option>
                            );
                        })}
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
