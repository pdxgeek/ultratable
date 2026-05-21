import React from 'react';
import { useNavigate } from 'react-router-dom';

import { useLeague } from '../context/LeagueContext';

const LeagueSelector: React.FC = () => {
    const { availableLeagues, availableSeasons, activeSeason, setActiveSeasonId, isSyncing } =
        useLeague();
    const navigate = useNavigate();

    return (
        <div className="flex gap-3 items-center">
            <select
                value={activeSeason?.id || ''}
                onChange={(e) => {
                    setActiveSeasonId(e.target.value);
                    navigate('/');
                }}
                className="px-4 py-2 rounded-md bg-bg-accent text-text-primary border border-border text-[0.9rem] font-semibold cursor-pointer"
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
                <span className="text-xs text-accent-blue font-medium">Syncing...</span>
            )}
        </div>
    );
};

export default LeagueSelector;
