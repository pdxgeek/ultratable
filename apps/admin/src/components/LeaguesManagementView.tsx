import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { CatalogBrowser } from './CatalogBrowser';
import { SeasonImporter } from './SeasonImporter';
import { LeagueConfig } from './LeagueConfig';
import type { Job, Execution } from './WorkersView';

export interface Country {
  id: string;
  name: string;
  code?: string;
  flag?: string;
}

export interface CatalogLeague {
  id: string;
  sourceId: number;
  name: string;
  type: string;
  logo?: string;
  country: string;
  seasons?: Season[];
}

export interface ManagedLeague {
  id: string;
  sourceId: number;
  name: string;
  logo?: string;
  metadata?: Record<string, unknown>;
}

export interface Season {
  id: string;
  year: number;
  configJson?: string;
  fixtureCount?: number;
  teamCount?: number;
  current?: boolean;
}

const LeaguesManagementView = ({ jobs = [], executions = [] }: { jobs?: Job[], executions?: Execution[] }) => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [catalogLeagues, setCatalogLeagues] = useState<CatalogLeague[]>([]);
  const [managedLeagues, setManagedLeagues] = useState<ManagedLeague[]>([]);

  // Box 2 (Importer) State
  const [selectedCatalogLeagueId, setSelectedCatalogLeagueId] = useState<string>('');
  const [catalogLeagueMetadata, setCatalogLeagueMetadata] = useState<CatalogLeague | null>(null);
  const [seasonsForCatalogLeague, setSeasonsForCatalogLeague] = useState<Season[]>([]);

  // Box 3 (Config) State
  const [selectedConfigLeagueId, setSelectedConfigLeagueId] = useState<string>('');
  const [configSeasons, setConfigSeasons] = useState<Season[]>([]);
  const [selectedConfigSeasonId, setSelectedConfigSeasonId] = useState<string>('');

  const [configTab, setConfigTab] = useState<'league' | 'season'>('season');
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

  const fetchData = async () => {
    console.log('LeaguesManagementView: Fetching countries and managed leagues...');
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query {
              catalogCountries { id name code flag }
              leagues { id name sourceId }
            }
          `
        })
      });
      const json = await resp.json();
      setCountries(json.data?.catalogCountries || []);
      setManagedLeagues(json.data?.leagues || []);
    } catch (e) {
      console.error('LeaguesManagementView: fetchData error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogLeagues = async (countryId: string) => {
    if (!countryId) return;
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id: String!) { catalogLeagues(countryId: $id) { id name type logo sourceId seasons { year current } } }`,
          variables: { id: countryId }
        })
      });
      const json = await resp.json();
      setCatalogLeagues(json.data?.catalogLeagues || []);
    } catch (e) {
      console.error('LeaguesManagementView: fetchCatalogLeagues error:', e);
    }
  };



  const fetchInternalSeasons = async (leagueId: string, setTask: (seasons: Season[]) => void) => {
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id: String!) { seasons(leagueId: $id) { id year configJson fixtureCount teamCount } }`,
          variables: { id: leagueId }
        })
      });
      const json = await resp.json();
      setTask(json.data?.seasons || []);
    } catch (e) {
      console.error('LeaguesManagementView: fetchInternalSeasons error:', e);
    }
  };

  const fetchCatalogMetadataBySourceId = async (sourceId: number) => {
    try {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($sourceId: Int!) { catalogLeagues(sourceId: $sourceId) { id seasons { year current } } }`,
          variables: { sourceId }
        })
      });
      const json = await resp.json();
      if (json.data?.catalogLeagues?.[0]) {
        setCatalogLeagueMetadata(json.data.catalogLeagues[0]);
      }
    } catch (e) {
      console.error('LeaguesManagementView: fetchCatalogMetadataBySourceId error:', e);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (selectedCountry) fetchCatalogLeagues(selectedCountry);
    else setCatalogLeagues([]);
  }, [selectedCountry]);

  // Box 2 Effect
  useEffect(() => {
    if (selectedCatalogLeagueId) {
      fetchInternalSeasons(selectedCatalogLeagueId, setSeasonsForCatalogLeague);

      const league = managedLeagues.find(l => l.id === selectedCatalogLeagueId);
      if (league?.sourceId) {
        fetchCatalogMetadataBySourceId(league.sourceId);
      }
    } else {
      setSeasonsForCatalogLeague([]);
      setCatalogLeagueMetadata(null);
    }
  }, [selectedCatalogLeagueId, managedLeagues]); // Added managedLeagues to dependency array

  // Box 3 Effect
  useEffect(() => {
    if (selectedConfigLeagueId) {
      fetchInternalSeasons(selectedConfigLeagueId, setConfigSeasons);
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
    } else if (configTab === 'season' && season) {
      const config = JSON.parse(season.configJson || '{}');
      setPromoInput((config.promotion || []).join(', '));
      setPlayoffInput((config.playoffs || []).join(', '));
      setRelInput((config.relegation || []).join(', '));
      setDeductions(JSON.stringify(config.deductions || [], null, 2));

      // Fetch teams for the helper dropdown
      if (league) {
        fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query($leagueId: Int, $season: Int) { teams(leagueId: $leagueId, season: $season) { id name } }`,
            variables: { leagueId: league.sourceId, season: season.year }
          })
        }).then(res => res.json()).then(json => {
          setConfigTeams(json.data?.teams || []);
          setHelperTeamId('');
          setHelperPoints(0);
          setHelperReason('');
        }).catch(err => console.error(err));
      }
    } else {
      setPromoInput('');
      setPlayoffInput('');
      setRelInput('');
      setDeductions('');
      setConfigTeams([]);
    }
  }, [selectedConfigSeasonId, configSeasons, selectedConfigLeagueId, managedLeagues, configTab]);

  const activateLeague = async (catalogId: string) => {
    setActionLoading(catalogId);
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!) { promoteLeague(catalogId: $id) { id name } }`,
          variables: { id: catalogId }
        })
      });
      await fetchData();
    } catch (e) {
      console.error(e);
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
        console.error("No associated catalog league found.");
        return;
      }

      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!) { refreshCatalogSeasons(catalogId: $id) { id seasons { year current } } }`,
          variables: { id: catalogId }
        })
      });

      await fetchCatalogMetadataBySourceId(league.sourceId);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const importSeason = async (leagueId: string, year: number) => {
    const key = `${leagueId}-${year}`;
    setActionLoading(key);
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!, $year: Int!) { importSeason(leagueId: $id, year: $year) { id year } }`,
          variables: { id: leagueId, year }
        })
      });
      // Refresh local seasons for both boxes if they happen to be showing this league
      if (selectedCatalogLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setSeasonsForCatalogLeague);
      }
      if (selectedConfigLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setConfigSeasons);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const syncSeasonData = async (leagueId: string, year: number) => {
    const key = `sync-${leagueId}-${year}`;
    setActionLoading(key);
    try {
      const league = managedLeagues.find(l => l.id === leagueId);
      if (!league?.sourceId) {
        alert('Source ID not found for league.');
        return;
      }

      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: Int!, $year: Int!) { syncFixtures(leagueId: $id, season: $year) { id } }`,
          variables: { id: league.sourceId, year }
        })
      });

      // Refresh to update counts
      await fetchInternalSeasons(leagueId, setConfigSeasons);
    } catch (e) {
      console.error('syncSeasonData error:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const removeSeason = async (leagueId: string, seasonId: string, year: number) => {
    if (!window.confirm(`Are you sure you want to remove the ${year} season? This will delete all associated fixtures and standings data.`)) return;
    const key = `${leagueId}-${year}`;
    setActionLoading(key);
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: String!) { removeSeason(seasonId: $id) }`,
          variables: { id: seasonId }
        })
      });
      // Refresh local seasons for both boxes
      if (selectedCatalogLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setSeasonsForCatalogLeague);
      }
      if (selectedConfigLeagueId === leagueId) {
        fetchInternalSeasons(leagueId, setConfigSeasons);
        if (selectedConfigSeasonId === seasonId) {
          setSelectedConfigSeasonId('');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const saveConfig = async () => {
    if (configTab === 'season' && !selectedConfigSeasonId) return;
    if (configTab === 'league' && !selectedConfigLeagueId) return;
    setActionLoading('save-config');
    try {
      const parseList = (str: string) => str.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      const configObj: Record<string, unknown> = {};

      const promo = parseList(promoInput);
      if (promo.length > 0) configObj.promotion = promo;

      const playoffs = parseList(playoffInput);
      if (playoffs.length > 0) configObj.playoffs = playoffs;

      const rel = parseList(relInput);
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

        await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation($id: String!, $json: String!) { saveSeasonConfig(id: $id, configJson: $json) { id } }`,
            variables: { id: selectedConfigSeasonId, json: JSON.stringify(configObj) }
          })
        });
      } else {
        await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation($id: String!, $json: String!) { saveLeagueConfig(id: $id, configJson: $json) { id } }`,
            variables: { id: selectedConfigLeagueId, json: JSON.stringify(configObj) }
          })
        });
        await fetchData(); // refresh leagues
      }

      fetchInternalSeasons(selectedConfigLeagueId, setConfigSeasons);
      alert('Configuration saved successfully.');
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return (
    <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-3xl">
      <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-6" />
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Waking Registry...</p>
    </div>
  );

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-24">
      {/* Box 1: Catalog Browser */}
      <CatalogBrowser
        countries={countries}
        selectedCountry={selectedCountry}
        setSelectedCountry={setSelectedCountry}
        catalogLeagues={catalogLeagues}
        managedLeagues={managedLeagues}
        activateLeague={activateLeague}
        actionLoading={actionLoading}
      />

      {/* Box 2: Catalog Seasons */}
      <SeasonImporter
        managedLeagues={managedLeagues}
        selectedCatalogLeagueId={selectedCatalogLeagueId}
        setSelectedCatalogLeagueId={setSelectedCatalogLeagueId}
        catalogLeagueMetadata={catalogLeagueMetadata}
        seasonsForCatalogLeague={seasonsForCatalogLeague}
        importSeason={importSeason}
        removeSeason={removeSeason}
        refreshCatalogSeasons={refreshCatalogSeasons}
        actionLoading={actionLoading}
      />

      {/* Box 3: Season Configuration */}
      <LeagueConfig
        managedLeagues={managedLeagues}
        selectedConfigLeagueId={selectedConfigLeagueId}
        setSelectedConfigLeagueId={setSelectedConfigLeagueId}
        setConfigTab={setConfigTab}
        configTab={configTab}
        configSeasons={configSeasons}
        selectedConfigSeasonId={selectedConfigSeasonId}
        setSelectedConfigSeasonId={setSelectedConfigSeasonId}
        syncSeasonData={syncSeasonData}
        actionLoading={actionLoading}
        executions={executions}
        jobs={jobs}
        promoInput={promoInput}
        setPromoInput={setPromoInput}
        playoffInput={playoffInput}
        setPlayoffInput={setPlayoffInput}
        relInput={relInput}
        setRelInput={setRelInput}
        deductions={deductions}
        setDeductions={setDeductions}
        helperTeamId={helperTeamId}
        setHelperTeamId={setHelperTeamId}
        configTeams={configTeams}
        helperPoints={helperPoints}
        setHelperPoints={setHelperPoints}
        helperReason={helperReason}
        setHelperReason={setHelperReason}
        saveConfig={saveConfig}
      />
    </div>
  );
};

export default LeaguesManagementView;
