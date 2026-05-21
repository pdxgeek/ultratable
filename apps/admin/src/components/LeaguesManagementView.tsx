import { Loader2 } from 'lucide-react';

import { CatalogBrowser } from './CatalogBrowser';
import { SeasonImporter } from './SeasonImporter';
import { LeagueConfig } from './LeagueConfig';
import { useLeaguesManagement } from './useLeaguesManagement';
import type { Job, Execution } from './WorkersView';

export type { Country, CatalogLeague, ManagedLeague, Season } from './leagues.types';

const LeaguesManagementView = ({ jobs = [], executions = [] }: { jobs?: Job[], executions?: Execution[] }) => {
  const state = useLeaguesManagement();

  if (state.loading) return (
    <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-3xl">
      <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-6" />
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Waking Registry...</p>
    </div>
  );

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-24">
      <CatalogBrowser
        countries={state.countries}
        selectedCountry={state.selectedCountry}
        setSelectedCountry={state.setSelectedCountry}
        catalogLeagues={state.catalogLeagues}
        managedLeagues={state.managedLeagues}
        activateLeague={state.activateLeague}
        actionLoading={state.actionLoading}
        initializeCatalog={state.initializeCatalog}
      />

      <SeasonImporter
        managedLeagues={state.filteredManagedLeagues}
        hasCountrySelected={!!state.selectedCountry}
        selectedCatalogLeagueId={state.selectedCatalogLeagueId}
        setSelectedCatalogLeagueId={state.setSelectedCatalogLeagueId}
        catalogLeagueMetadata={state.catalogLeagueMetadata}
        seasonsForCatalogLeague={state.seasonsForCatalogLeague}
        importSeason={state.importSeason}
        removeSeason={state.removeSeason}
        refreshCatalogSeasons={state.refreshCatalogSeasons}
        actionLoading={state.actionLoading}
      />

      <LeagueConfig
        managedLeagues={state.managedLeagues}
        selectedConfigLeagueId={state.selectedConfigLeagueId}
        setSelectedConfigLeagueId={state.setSelectedConfigLeagueId}
        setConfigTab={state.setConfigTab}
        configTab={state.configTab}
        configSeasons={state.configSeasons}
        selectedConfigSeasonId={state.selectedConfigSeasonId}
        setSelectedConfigSeasonId={state.setSelectedConfigSeasonId}
        syncSeasonData={state.syncSeasonData}
        actionLoading={state.actionLoading}
        executions={executions}
        jobs={jobs}
        promoInput={state.promoInput}
        setPromoInput={state.setPromoInput}
        playoffInput={state.playoffInput}
        setPlayoffInput={state.setPlayoffInput}
        relInput={state.relInput}
        setRelInput={state.setRelInput}
        seasonConfigJson={state.seasonConfigJson}
        setSeasonConfigJson={state.setSeasonConfigJson}
        leagueDefaultsJson={state.leagueDefaultsJson}
        rankingFormulas={state.rankingFormulas}
        appliedCriteria={state.appliedCriteria}
        setAppliedCriteria={state.setAppliedCriteria}
        helperTeamId={state.helperTeamId}
        setHelperTeamId={state.setHelperTeamId}
        configTeams={state.configTeams}
        helperPoints={state.helperPoints}
        setHelperPoints={state.setHelperPoints}
        helperReason={state.helperReason}
        setHelperReason={state.setHelperReason}
        saveConfig={state.saveConfig}
      />
    </div>
  );
};

export default LeaguesManagementView;
