import { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { authService } from './services/auth/authService';

// Contexts
import { PopupProvider } from './context/PopupContext';
import { SettingsProvider } from './context/SettingsContext';

// Components
import Layout from './components/Layout';
import StandingsTable from './components/StandingsTable';
import SyncBar from './components/SyncBar';
import PopupManager from './components/PopupManager';

// Pages
import SettingsPage from './pages/SettingsPage';
import DataPage from './pages/DataPage';
import MatchPage from './pages/MatchPage';
import { LoginPage } from './pages/LoginPage';
import { AccountPage } from './pages/AccountPage';



function App() {
  const [hasKey, setHasKey] = useState(hasApiKey());
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    debugLogger.init();

    // Initialize graphics registry from database
    gfxRegistry.initialize().catch(err => {
      console.error('Failed to initialize graphics registry:', err);
    });

    // Initialize auth service
    authService.initialize().then(() => {
      setIsAuthenticated(authService.isAuthenticated());
      setAuthInitialized(true);
    }).catch(err => {
      console.error('Failed to initialize auth service:', err);
      setAuthInitialized(true);
    });
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

  // Check if league requires API key (non-mock providers need keys)
  const requiresApiKey = !(league.integrations?.basicTeamInfo?.startsWith('mock-') ?? false);

  // React Query Hook
  const { teams: apiTeams, fixtures: apiFixtures, isLoading, error: queryError, refetch } = useLeagueData(league);

  // Derived State (Data Packs)
  const { teamPack, seasonPack, fixtures, standings, gfxPack } = useMemo(() => {
    if (!apiTeams || !apiFixtures) {
      return {
        teamPack: new Map(),
        seasonPack: null,
        fixtures: [],
        standings: [],
        gfxPack: []
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

    const fList = apiFixtures; // Already transformed by provider
    const compiled = compileStandings(tPack, fList, sPack.rules);

    return {
      teamPack: tPack,
      seasonPack: sPack,
      fixtures: fList,
      standings: compiled,
      gfxPack: gPack
    };
  }, [apiTeams, apiFixtures, league]);

  // Side Effect: Update GFX Registry (moved from useMemo to avoid side effects in memoization)
  useEffect(() => {
    if (gfxPack.length > 0) {
      gfxRegistry.registerBatch(gfxPack);
      gfxRegistry.loadAll().catch(console.warn);
    }
  }, [gfxPack]);

  // Handle API Key check for providers that require it
  useEffect(() => {
    if (hasKey && requiresApiKey) {
      refetch();
    }
  }, [hasKey, requiresApiKey, refetch]);

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
      {!hasKey && requiresApiKey && (
        <div className="warning-banner">
          <span>⚠️ <strong>API Key Missing:</strong> This league requires an API Key. Data may not load.</span>
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

  // Show loading while auth initializes
  if (!authInitialized) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__spinner" />
        <p className="loading-screen__text">Initializing...</p>
      </div>
    );
  }

  return (
    <SettingsProvider>
      <BrowserRouter>
        <PopupProvider>
          <div className="app">
            <PopupManager />
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />

              {/* Protected Routes */}
              {isAuthenticated ? (
                <>
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
                    <Route path="account" element={<AccountPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              ) : (
                <Route path="*" element={<Navigate to="/login" replace />} />
              )}
            </Routes>
          </div>
        </PopupProvider>
      </BrowserRouter>
    </SettingsProvider>
  );
}

export default App;
