import { useState, useEffect } from 'react';
import type { CatalogLeague, ConfigTab, Country, ManagedLeague, Season } from './leagues.types';
import * as api from './leagues-api';

const logError = (label: string, e: unknown) => console.error(`LeaguesManagementView: ${label} error:`, e);

const alertError = (label: string, e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  alert(`${label}: ${msg}`);
  console.error(e);
};

const parseList = (str: string) =>
  str.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

export function useLeaguesManagement() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [catalogLeagues, setCatalogLeagues] = useState<CatalogLeague[]>([]);
  const [managedLeagues, setManagedLeagues] = useState<ManagedLeague[]>([]);

  const [selectedCatalogLeagueId, setSelectedCatalogLeagueId] = useState<string>('');
  const [catalogLeagueMetadata, setCatalogLeagueMetadata] = useState<CatalogLeague | null>(null);
  const [seasonsForCatalogLeague, setSeasonsForCatalogLeague] = useState<Season[]>([]);

  const [selectedConfigLeagueId, setSelectedConfigLeagueId] = useState<string>('');
  const [configSeasons, setConfigSeasons] = useState<Season[]>([]);
  const [selectedConfigSeasonId, setSelectedConfigSeasonId] = useState<string>('');

  const [configTab, setConfigTab] = useState<ConfigTab>('season');
  const [promoInput, setPromoInput] = useState<string>('');
  const [playoffInput, setPlayoffInput] = useState<string>('');
  const [relInput, setRelInput] = useState<string>('');
  const [deductions, setDeductions] = useState<string>('');
  const [configTeams, setConfigTeams] = useState<Record<string, unknown>[]>([]);
  const [helperTeamId, setHelperTeamId] = useState<string>('');
  const [helperPoints, setHelperPoints] = useState<number>(0);
  const [helperReason, setHelperReason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refreshTopLevel = async () => {
    try {
      const data = await api.fetchCatalogAndManagedLeagues();
      setCountries(data.catalogCountries || []);
      setManagedLeagues(data.leagues || []);
    } catch (e) {
      logError('fetchData', e);
    } finally {
      setLoading(false);
    }
  };

  const loadCatalogLeaguesForCountry = async (countryId: string) => {
    if (!countryId) return;
    setActionLoading(`country-${countryId}`);
    try {
      const cached = await api.fetchCachedCatalogLeagues(countryId);
      if (cached.catalogLeagues?.length) {
        setCatalogLeagues(cached.catalogLeagues);
        return;
      }
      const synced = await api.syncCountryLeagues(countryId);
      setCatalogLeagues(synced.syncCountryLeagues || []);
    } catch (e) {
      logError('fetchCatalogLeagues', e);
    } finally {
      setActionLoading(null);
    }
  };

  const loadSeasons = async (leagueId: string, setTask: (seasons: Season[]) => void) => {
    try {
      const data = await api.fetchSeasons(leagueId);
      setTask(data.seasons || []);
    } catch (e) {
      logError('fetchInternalSeasons', e);
    }
  };

  const loadCatalogMetadata = async (sourceId: number) => {
    try {
      const data = await api.fetchCatalogLeagueBySourceId(sourceId);
      if (data.catalogLeagues?.[0]) {
        setCatalogLeagueMetadata(data.catalogLeagues[0]);
      }
    } catch (e) {
      logError('fetchCatalogMetadataBySourceId', e);
    }
  };

  useEffect(() => { refreshTopLevel(); }, []);

  const selectedCountryName = countries.find(c => c.id === selectedCountry)?.name;
  const filteredManagedLeagues = selectedCountryName
    ? managedLeagues.filter(l => l.country === selectedCountryName)
    : [];

  useEffect(() => {
    setCatalogLeagues([]); // Clear stale leagues immediately on country change.
    if (selectedCountry) loadCatalogLeaguesForCountry(selectedCountry);
    setSelectedCatalogLeagueId('');
  }, [selectedCountry]);

  useEffect(() => {
    if (selectedCatalogLeagueId) {
      loadSeasons(selectedCatalogLeagueId, setSeasonsForCatalogLeague);
      const league = managedLeagues.find(l => l.id === selectedCatalogLeagueId);
      if (league?.sourceId) loadCatalogMetadata(league.sourceId);
    } else {
      setSeasonsForCatalogLeague([]);
      setCatalogLeagueMetadata(null);
    }
  }, [selectedCatalogLeagueId, managedLeagues]);

  useEffect(() => {
    if (selectedConfigLeagueId) {
      loadSeasons(selectedConfigLeagueId, setConfigSeasons);
    } else {
      setConfigSeasons([]);
      setSelectedConfigSeasonId('');
    }
  }, [selectedConfigLeagueId]);

  useEffect(() => {
    const season = configSeasons.find(s => s.id === selectedConfigSeasonId);
    const league = managedLeagues.find(l => l.id === selectedConfigLeagueId);

    if (configTab === 'league' && league) {
      const config = (league.metadata as Record<string, string[]>) || {};
      setPromoInput((config.promotion || []).join(', '));
      setPlayoffInput((config.playoffs || []).join(', '));
      setRelInput((config.relegation || []).join(', '));
      setDeductions('');
      return;
    }

    if (configTab === 'season' && season) {
      const config = JSON.parse(season.configJson || '{}');
      setPromoInput((config.promotion || []).join(', '));
      setPlayoffInput((config.playoffs || []).join(', '));
      setRelInput((config.relegation || []).join(', '));
      setDeductions(JSON.stringify(config.deductions || [], null, 2));

      if (league) {
        api.fetchTeamsForSeason(season.id).then(data => {
          setConfigTeams(data.teams || []);
          setHelperTeamId('');
          setHelperPoints(0);
          setHelperReason('');
        }).catch(err => console.error(err));
      }
      return;
    }

    setPromoInput('');
    setPlayoffInput('');
    setRelInput('');
    setDeductions('');
    setConfigTeams([]);
  }, [selectedConfigSeasonId, configSeasons, selectedConfigLeagueId, managedLeagues, configTab]);

  const initializeCatalog = async () => {
    setActionLoading('init-catalog');
    try {
      await api.initCatalog();
      await refreshTopLevel();
    } catch (e) {
      alertError('Failed to initialize catalog', e);
    } finally {
      setActionLoading(null);
    }
  };

  const activateLeague = async (catalogId: string) => {
    setActionLoading(catalogId);
    try {
      await api.promoteLeague(catalogId);
      await refreshTopLevel();
    } catch (e) {
      alertError('Failed to activate league', e);
    } finally {
      setActionLoading(null);
    }
  };

  const refreshCatalogSeasons = async (managedLeagueId: string) => {
    setActionLoading(`${managedLeagueId}-refresh`);
    try {
      const league = managedLeagues.find(l => l.id === managedLeagueId);
      if (!league?.sourceId) return;

      const catalogId = catalogLeagueMetadata?.id;
      if (!catalogId) {
        alert('No associated catalog league found.');
        return;
      }

      await api.refreshCatalogSeasonsByCatalogId(catalogId);
      await loadCatalogMetadata(league.sourceId);
    } catch (e) {
      alertError('Failed to refresh catalog seasons', e);
    } finally {
      setActionLoading(null);
    }
  };

  const importSeason = async (leagueId: string, year: number) => {
    setActionLoading(`${leagueId}-${year}`);
    try {
      await api.importSeasonForLeague(leagueId, year);
      if (selectedCatalogLeagueId === leagueId) loadSeasons(leagueId, setSeasonsForCatalogLeague);
      if (selectedConfigLeagueId === leagueId) loadSeasons(leagueId, setConfigSeasons);
    } catch (e) {
      alertError('Failed to import season', e);
    } finally {
      setActionLoading(null);
    }
  };

  const syncSeasonData = async (leagueId: string, year: number) => {
    setActionLoading(`sync-${leagueId}-${year}`);
    try {
      const league = managedLeagues.find(l => l.id === leagueId);
      if (!league?.sourceId) {
        alert('Source ID not found for league.');
        return;
      }
      await api.syncSeasonFixtures(league.sourceId, year);
      await loadSeasons(leagueId, setConfigSeasons);
    } catch (e) {
      alertError('Sync failed', e);
    } finally {
      setActionLoading(null);
    }
  };

  const removeSeason = async (leagueId: string, seasonId: string, year: number) => {
    if (!window.confirm(`Are you sure you want to remove the ${year} season? This will delete all associated fixtures and standings data.`)) return;
    setActionLoading(`${leagueId}-${year}`);
    try {
      await api.removeSeasonById(seasonId);
      if (selectedCatalogLeagueId === leagueId) loadSeasons(leagueId, setSeasonsForCatalogLeague);
      if (selectedConfigLeagueId === leagueId) {
        loadSeasons(leagueId, setConfigSeasons);
        if (selectedConfigSeasonId === seasonId) setSelectedConfigSeasonId('');
      }
    } catch (e) {
      alertError('Failed to remove season', e);
    } finally {
      setActionLoading(null);
    }
  };

  const saveConfig = async () => {
    if (configTab === 'season' && !selectedConfigSeasonId) return;
    if (configTab === 'league' && !selectedConfigLeagueId) return;
    setActionLoading('save-config');
    try {
      const configObj: Record<string, unknown> = {};
      const promo = parseList(promoInput);
      const playoffs = parseList(playoffInput);
      const rel = parseList(relInput);
      if (promo.length > 0) configObj.promotion = promo;
      if (playoffs.length > 0) configObj.playoffs = playoffs;
      if (rel.length > 0) configObj.relegation = rel;

      if (configTab === 'season') {
        let parsedDeductions = [];
        try {
          parsedDeductions = JSON.parse(deductions || '[]');
        } catch {
          alert('Invalid JSON for deductions');
          return;
        }
        if (parsedDeductions.length > 0) configObj.deductions = parsedDeductions;
        await api.saveSeasonConfig(selectedConfigSeasonId, JSON.stringify(configObj));
      } else {
        await api.saveLeagueConfig(selectedConfigLeagueId, JSON.stringify(configObj));
        await refreshTopLevel();
      }

      loadSeasons(selectedConfigLeagueId, setConfigSeasons);
      alert('Configuration saved successfully.');
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  return {
    loading,
    actionLoading,
    countries,
    selectedCountry,
    setSelectedCountry,
    catalogLeagues,
    managedLeagues,
    filteredManagedLeagues,
    selectedCatalogLeagueId,
    setSelectedCatalogLeagueId,
    catalogLeagueMetadata,
    seasonsForCatalogLeague,
    selectedConfigLeagueId,
    setSelectedConfigLeagueId,
    configSeasons,
    selectedConfigSeasonId,
    setSelectedConfigSeasonId,
    configTab,
    setConfigTab,
    promoInput,
    setPromoInput,
    playoffInput,
    setPlayoffInput,
    relInput,
    setRelInput,
    deductions,
    setDeductions,
    configTeams,
    helperTeamId,
    setHelperTeamId,
    helperPoints,
    setHelperPoints,
    helperReason,
    setHelperReason,
    initializeCatalog,
    activateLeague,
    refreshCatalogSeasons,
    importSeason,
    syncSeasonData,
    removeSeason,
    saveConfig,
  };
}
