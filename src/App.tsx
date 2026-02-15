import { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useLeagueData } from './hooks/useLeagueData';

import { DEFAULT_LEAGUE } from './types';
import {
  hasApiKey,
} from './services/apiFootball';
import { getLeagues } from './services/leagueRegistry';
import {
  generateSeasonPack,
  generateTeamPack,
  generateGfxPack,
} from './services/dataPacks';
import { gfxRegistry } from './services/gfxRegistry';
import { debugLogger } from './services/debugLogger';
import {
  compileStandings,
} from './services/dataCompiler';

// Contexts
import { PopupProvider } from './context/PopupContext';
import { SettingsProvider } from './context/SettingsContext';

// Components
import Layout from './components/Layout';
import StandingsTable from './components/StandingsTable';
import SyncBar from './components/SyncBar';

// Pages
import SettingsPage from './pages/SettingsPage';
import DataPage from './pages/DataPage';
import MatchPage from './pages/MatchPage';



function App() {
  const [hasKey, setHasKey] = useState(hasApiKey());

  useEffect(() => {
    debugLogger.init();
  }, []);

  // Available Leagues (Merged Config + Custom)
  const [availableLeagues, setAvailableLeagues] = useState(getLeagues());

  // League State (formatted as "id_season")
  const defaultKey = `${DEFAULT_LEAGUE.id}_${DEFAULT_LEAGUE.season}`;
  const [activeLeagueKey, setActiveLeagueKey] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('ultratable_active_league');
      // Verify saved key exists in available leagues (or at least looks valid)
      // We can't easily check availableLeagues here as it's state, but we can trust it or fallback later
      if (saved) return saved;
    }
    return defaultKey;
  });

  // Persist active league
  useEffect(() => {
    localStorage.setItem('ultratable_active_league', activeLeagueKey);
  }, [activeLeagueKey]);

  const league = availableLeagues[activeLeagueKey] || DEFAULT_LEAGUE;

  // Refresh available leagues on mount and when changed
  const refreshLeagues = useCallback(() => {
    setAvailableLeagues(getLeagues());
  }, []);

  // Use setHasKey to avoid lint error (logic could be expanded later)
  useEffect(() => {
    if (hasKey) { /* no-op */ }
  }, [hasKey]);

  if (!league) {
    console.error('League not found for key:', activeLeagueKey);
  } else {
    console.log('App Render: ActiveKey=', activeLeagueKey, 'League=', league.name, league.id);
  }

  // Determine if we should use mock data based on the league ID
  // Mock leagues have IDs > 8000 in our config
  // const useMockData = league.id > 8000;
  // Better: Check integration config
  const useMockData = league.integrations?.basicTeamInfo?.startsWith('mock-') ?? false;

  // React Query Hook
  const { teams: apiTeams, fixtures: apiFixtures, isLoading, error: queryError, refetch } = useLeagueData(league);

  // Derived State (Data Packs)
  const { teamPack, seasonPack, fixtures, standings } = useMemo(() => {
    if (!apiTeams || !apiFixtures) {
      return {
        teamPack: new Map(),
        seasonPack: null,
        fixtures: [],
        standings: []
      };
    }

    const tPack = generateTeamPack(apiTeams);
    const sPack = generateSeasonPack(
      league.id,
      league.season,
      apiTeams,
      apiFixtures,
      [],
      league.rules
    );
    const gPack = generateGfxPack(apiTeams);

    // Side Effect: Update GFX Registry (safe to do here as it's idempotent-ish, or move to useEffect)
    gfxRegistry.registerBatch(gPack);
    gfxRegistry.loadAll().catch(console.warn);

    const fList = apiFixtures; // Already transformed by provider
    const compiled = compileStandings(tPack, fList, sPack.rules);

    return {
      teamPack: tPack,
      seasonPack: sPack,
      fixtures: fList,
      standings: compiled
    };
  }, [apiTeams, apiFixtures, league]);

  // Handle API Key check for real data
  useEffect(() => {
    if (hasKey && !useMockData) {
      refetch();
    }
  }, [hasKey, useMockData, refetch]);


  if (!hasKey && !useMockData) {
    // Non-blocking warning instead of modal
  }

  const syncBar = (
    <>
      <SyncBar
        leagueName={seasonPack?.name ?? league.name}
        leagueId={activeLeagueKey}
        season={league.season}
        syncing={isLoading}
        onSync={() => refetch()}
        leagues={availableLeagues}
        onLeagueChange={setActiveLeagueKey}
      />
      {!hasKey && !useMockData && (
        <div className="warning-banner">
          <span>⚠️ <strong>API Key Missing:</strong> You are viewing a real league but have not configured an API Key. Data may not load.</span>
          <a href="/settings">Go to Settings</a>
        </div>
      )}
      {(queryError) && (
        <div className="error-banner">
          <span>⚠️ {queryError instanceof Error ? queryError.message : 'Error loading data'}</span>
        </div>
      )}
      {isLoading && (
        <div className="loading-screen">
          <div className="loading-screen__spinner" />
          <p className="loading-screen__text">Loading Data Packs...</p>
        </div>
      )}
    </>
  );

  return (
    <SettingsProvider>
      <BrowserRouter>
        <PopupProvider>
          <div className="app">
            <Routes>
              <Route path="/" element={<Layout syncBar={syncBar} activeLeagueKey={activeLeagueKey} />}>
                <Route
                  index
                  element={
                    seasonPack ? (
                      <StandingsTable
                        standings={standings}
                        teams={teamPack}
                        fixtures={fixtures}
                        rules={seasonPack.rules}
                      />
                    ) : null
                  }
                />
                <Route
                  path="settings"
                  element={
                    <SettingsPage
                      onLeagueAdded={refreshLeagues}
                      onKeySaved={() => setHasKey(true)}
                      leagues={availableLeagues}
                    />
                  }
                />
                <Route path="match/:id" element={<MatchPage />} />
                <Route path="data" element={<DataPage />} />
              </Route>
            </Routes>
          </div>
        </PopupProvider>
      </BrowserRouter>
    </SettingsProvider>
  );
}

export default App;
