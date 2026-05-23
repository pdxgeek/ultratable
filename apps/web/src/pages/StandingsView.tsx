import type { StandingsFilter } from '../logic/dataCompiler';

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Can } from '../auth/abilities';
import StandingsTable from '../components/StandingsTable';
import { useLeague } from '../context/LeagueContext';
import { useStandings } from '../hooks/useStandings';

const StandingsView: React.FC = () => {
    const { activeLeague, activeSeason, isLoading } = useLeague();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<StandingsFilter>('all');
    const { standings, fixtures, teamsMap, lastUpdated } = useStandings(activeSeason?.id || '', {
        filter,
    });

    if (isLoading) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Loading data...</p>
            </div>
        );
    }

    if (!activeSeason) {
        return (
            <div className="text-center py-24">
                <p className="text-text-secondary">Please select a league and season.</p>
            </div>
        );
    }

    return (
        <main>
            <div className="mt-6 mb-4">
                <h2 className="text-xl m-0 flex items-center gap-2">
                    {activeLeague?.countryFlag && (
                        <img
                            src={activeLeague.countryFlag}
                            alt={activeLeague.country ?? ''}
                            className="w-6 h-6 rounded-full object-cover ring-1 ring-black/10 bg-white"
                        />
                    )}
                    <span>{activeLeague?.name ?? 'League Table'}</span>
                </h2>
            </div>
            <StandingsTable
                standings={standings}
                fixtures={fixtures}
                teamsMap={teamsMap}
                filter={filter}
                onFilterChange={setFilter}
                toolbarActions={
                    <Can I="create" a="Prediction">
                        <button
                            type="button"
                            onClick={() => navigate('/predictions')}
                            className="px-4 py-1.5 rounded-[20px] border border-accent-blue text-[0.85rem] font-semibold cursor-pointer transition-all bg-accent-blue text-white hover:brightness-110"
                        >
                            Predictions
                        </button>
                    </Can>
                }
            />
            {lastUpdated && (
                <div className="mt-3 flex justify-center">
                    <span className="text-xs text-text-muted">
                        Last synced: {new Date(lastUpdated).toLocaleTimeString()}
                    </span>
                </div>
            )}
        </main>
    );
};

export default StandingsView;
