import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useLeagueData } from './hooks/useLeagueData';
import {
  hasApiKey,
} from './services/apiFootball';
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
import { LeagueProvider, useLeague } from './context/LeagueContext';

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
  return (
    <SettingsProvider>
      <LeagueProvider>
        <BrowserRouter>
          <PopupProvider>
            <AppContent />
          </PopupProvider>
        </BrowserRouter>
      </LeagueProvider>
    </SettingsProvider>
  );
}

function AppContent() {
  const {
    activeLeague: league,
    activeLeagueKey,
    availableLeagues,
    refreshLeagues,
  } = useLeague();

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
  // MOVED TO LeagueContext

  // Load leagues on mount
  // MOVED TO LeagueContext

  // League State (formatted as "id_season")
  // MOVED TO LeagueContext

  // Persist active league
  // MOVED TO LeagueContext

  // Refresh available leagues on mount and when changed
  // MOVED TO LeagueContext

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
  const { teams: apiTeams, fixtures: apiFixtures, isLoading, error: queryError, refetch } = useLeagueData(league, { enabled: authInitialized });

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
    const compiled = compileStandings(tPack, fList, sPack.rules, league.deductions);


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
      gfxRegistry.loadAll(gfxPack.map(g => g.id)).catch(console.warn);
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
        syncing={isLoading}
        onSync={() => refetch()}
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
                      key={activeLeagueKey}
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
                  authService.isAdmin() ? (
                    <SettingsPage
                      onLeagueAdded={refreshLeagues}
                      onKeySaved={() => setHasKey(true)}
                      leagues={availableLeagues}
                    />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route path="match/:id" element={<MatchPage />} />
              <Route
                path="data"
                element={
                  authService.isAdmin() ? (
                    <DataPage />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="account"
                element={
                  authService.isAdmin() ? (
                    <AccountPage />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </div>
  );
}

export default App;
