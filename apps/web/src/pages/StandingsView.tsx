import React, { useState } from 'react';
import { useLeague } from '../context/LeagueContext';
import { useStandings } from '../hooks/useStandings';
import StandingsTable from '../components/StandingsTable';
import type { StandingsFilter } from '../logic/dataCompiler';

const StandingsView: React.FC = () => {
    const { activeSeason, isLoading } = useLeague();
    const [filter, setFilter] = useState<StandingsFilter>('all');
    const { standings, fixtures, teamsMap, lastUpdated } = useStandings(activeSeason?.id || '', { filter });

    if (isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Loading data...</p>
            </div>
        );
    }

    if (!activeSeason) {
        return (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Please select a league and season.</p>
            </div>
        );
    }

    return (
        <main>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                margin: '24px 0 16px 0'
            }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>League Table</h2>
                {lastUpdated && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Last synced: {new Date(lastUpdated).toLocaleTimeString()}
                    </span>
                )}
            </div>
            <StandingsTable
                standings={standings}
                fixtures={fixtures}
                teamsMap={teamsMap}
                filter={filter}
                onFilterChange={setFilter}
            />
        </main>
    );
};

export default StandingsView;
