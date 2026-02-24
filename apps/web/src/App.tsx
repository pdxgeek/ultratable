import React, { useState } from 'react';
import { useLeague } from './context/LeagueContext';
import { useStandings } from './hooks/useStandings';
import StandingsTable from './components/StandingsTable';
import LeagueSelector from './components/LeagueSelector';
import type { StandingsFilter } from './logic/dataCompiler';

const App: React.FC = () => {
  const { activeSeason, isLoading } = useLeague();
  const [filter, setFilter] = useState<StandingsFilter>('all');
  const { standings, fixtures, teamsMap, lastUpdated } = useStandings(activeSeason?.id || '', { filter });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '40px'
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>UltraTable</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Live Standings &amp; Data Sync
          </p>
        </div>
        <LeagueSelector />
      </header>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading data...</p>
        </div>
      ) : activeSeason ? (
        <main>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '16px'
          }}>
            <h2 style={{ fontSize: '1.25rem' }}>League Table</h2>
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
      ) : (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Please select a league and season.</p>
        </div>
      )}
    </div>
  );
};

export default App;
