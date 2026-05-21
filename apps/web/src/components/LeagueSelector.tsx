import React from 'react';

import { useLeague } from '../context/LeagueContext';

const LeagueSelector: React.FC = () => {
    const { availableLeagues, availableSeasons, activeSeason, setActiveSeasonId, isSyncing } =
        useLeague();

    return (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
                value={activeSeason?.id || ''}
                onChange={(e) => setActiveSeasonId(e.target.value)}
                style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-accent)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                <option value="" disabled>
                    Select Season
                </option>
                {availableLeagues.map((league) => (
                    <optgroup key={league.id} label={league.name}>
                        {availableSeasons
                            .filter((s) => s.leagueId === league.id)
                            .sort((a, b) => b.year - a.year)
                            .map((season) => (
                                <option key={season.id} value={season.id}>
                                    {league.name} {season.year}
                                </option>
                            ))}
                    </optgroup>
                ))}
            </select>

            {isSyncing && (
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 500 }}>
                    Syncing...
                </span>
            )}
        </div>
    );
};

export default LeagueSelector;
