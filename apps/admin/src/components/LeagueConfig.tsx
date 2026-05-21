import type { ConfigTab, ManagedLeague, RankingFormula, Season } from './leagues.types';
import type { Execution, Job } from './WorkersView';

import React from 'react';
import { AlertCircle, Database, Globe, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { ConfigTabs } from './league-config/ConfigTabs';
import { RankingFormulaInputs } from './league-config/RankingFormulaInputs';
import { RankingPrioritySelector } from './league-config/RankingPrioritySelector';
import { SeasonOverridesEditor } from './league-config/SeasonOverridesEditor';
import { SeasonPicker } from './league-config/SeasonPicker';
import { SyncProgressBar } from './league-config/SyncProgressBar';

interface LeagueConfigProps {
    managedLeagues: ManagedLeague[];
    selectedConfigLeagueId: string;
    setSelectedConfigLeagueId: (id: string) => void;
    setConfigTab: (tab: ConfigTab) => void;
    configTab: ConfigTab;
    configSeasons: Season[];
    selectedConfigSeasonId: string;
    setSelectedConfigSeasonId: (id: string) => void;
    syncSeasonData: (leagueId: string, year: number) => void;
    actionLoading: string | null;
    executions: Execution[];
    jobs: Job[];
    promoInput: string;
    setPromoInput: (val: string) => void;
    playoffInput: string;
    setPlayoffInput: (val: string) => void;
    relInput: string;
    setRelInput: (val: string) => void;
    seasonConfigJson: string;
    setSeasonConfigJson: (val: string) => void;
    leagueDefaultsJson: string;
    rankingFormulas: RankingFormula[];
    appliedCriteria: string[];
    setAppliedCriteria: (ids: string[]) => void;
    helperTeamId: string;
    setHelperTeamId: (val: string) => void;
    configTeams: Record<string, unknown>[];
    helperPoints: number;
    setHelperPoints: (val: number) => void;
    helperReason: string;
    setHelperReason: (val: string) => void;
    saveConfig: () => void;
}

function findActiveExecution(
    configTab: ConfigTab,
    managedLeagues: ManagedLeague[],
    selectedConfigLeagueId: string,
    configSeasons: Season[],
    selectedConfigSeasonId: string,
    jobs: Job[],
    executions: Execution[],
): Execution | null {
    if (configTab !== 'season') return null;
    const sourceId = managedLeagues.find((l) => l.id === selectedConfigLeagueId)?.sourceId;
    const year = configSeasons.find((s) => s.id === selectedConfigSeasonId)?.year;
    if (!sourceId || !year) return null;
    const jobName = `sync-fixtures-${sourceId}-${year}`;
    const jobId = jobs.find((j) => j.name === jobName)?.id;
    if (!jobId) return null;
    return executions.find((ex) => ex.status === 'running' && ex.jobId === jobId) || null;
}

export const LeagueConfig: React.FC<LeagueConfigProps> = ({
    managedLeagues,
    selectedConfigLeagueId,
    setSelectedConfigLeagueId,
    setConfigTab,
    configTab,
    configSeasons,
    selectedConfigSeasonId,
    setSelectedConfigSeasonId,
    syncSeasonData,
    actionLoading,
    executions,
    jobs,
    promoInput,
    setPromoInput,
    playoffInput,
    setPlayoffInput,
    relInput,
    setRelInput,
    seasonConfigJson,
    setSeasonConfigJson,
    leagueDefaultsJson,
    rankingFormulas,
    appliedCriteria,
    setAppliedCriteria,
    helperTeamId,
    setHelperTeamId,
    configTeams,
    helperPoints,
    setHelperPoints,
    helperReason,
    setHelperReason,
    saveConfig,
}) => {
    const selectedLeagueName = managedLeagues.find((l) => l.id === selectedConfigLeagueId)?.name;
    const activeExecution = findActiveExecution(
        configTab,
        managedLeagues,
        selectedConfigLeagueId,
        configSeasons,
        selectedConfigSeasonId,
        jobs,
        executions,
    );
    const seasonSelected = configTab === 'season' && !!selectedConfigSeasonId;

    return (
        <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm space-y-8 relative overflow-hidden group/box3 transition-all hover:border-slate-800">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
                <div>
                    <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                        <Database className="w-5 h-5 text-amber-500" />
                        Box 3: Configuration & Data Sync
                    </h3>
                    <p className="text-sm text-slate-400 mt-2">
                        Manage settings, sync fixtures, and configure standings rules.
                    </p>
                </div>
                <Select
                    value={selectedConfigLeagueId || undefined}
                    onValueChange={(v) => {
                        setSelectedConfigLeagueId(v);
                        setConfigTab('league');
                    }}
                >
                    <SelectTrigger className="min-w-[200px] h-10 bg-slate-900 border-slate-700/50 text-white focus-visible:border-amber-500 focus-visible:ring-0">
                        <SelectValue placeholder="Select League..." />
                    </SelectTrigger>
                    <SelectContent>
                        {managedLeagues.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                                {l.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {selectedConfigLeagueId ? (
                <div className="space-y-8 relative z-10 animate-in fade-in duration-300">
                    <ConfigTabs configTab={configTab} setConfigTab={setConfigTab} />

                    {configTab === 'season' && (
                        <SeasonPicker
                            configSeasons={configSeasons}
                            selectedConfigSeasonId={selectedConfigSeasonId}
                            setSelectedConfigSeasonId={setSelectedConfigSeasonId}
                            onSync={() => {
                                const s = configSeasons.find(
                                    (s) => s.id === selectedConfigSeasonId,
                                );
                                if (s) syncSeasonData(selectedConfigLeagueId, s.year);
                            }}
                            syncing={actionLoading?.startsWith('sync-') ?? false}
                        />
                    )}

                    {configTab === 'league' && (
                        <>
                            <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800/40">
                                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50">
                                    <Globe className="w-5 h-5 text-amber-500" />
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1.5">
                                        League Target
                                    </h4>
                                    <div className="text-sm font-semibold text-white px-2 py-1">
                                        {selectedLeagueName}
                                    </div>
                                </div>
                            </div>
                            <RankingFormulaInputs
                                promoInput={promoInput}
                                setPromoInput={setPromoInput}
                                playoffInput={playoffInput}
                                setPlayoffInput={setPlayoffInput}
                                relInput={relInput}
                                setRelInput={setRelInput}
                            />
                        </>
                    )}

                    <SyncProgressBar activeExecution={activeExecution} />

                    {seasonSelected && (
                        <>
                            <RankingPrioritySelector
                                available={rankingFormulas}
                                appliedIds={appliedCriteria}
                                setAppliedIds={setAppliedCriteria}
                            />

                            <SeasonOverridesEditor
                                configJson={seasonConfigJson}
                                setConfigJson={setSeasonConfigJson}
                                leagueDefaultsJson={leagueDefaultsJson}
                                configTeams={configTeams}
                                helperTeamId={helperTeamId}
                                setHelperTeamId={setHelperTeamId}
                                helperPoints={helperPoints}
                                setHelperPoints={setHelperPoints}
                                helperReason={helperReason}
                                setHelperReason={setHelperReason}
                            />
                        </>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-800/40 pt-8">
                        <div className="flex items-center gap-4 text-slate-500 text-xs italic">
                            <AlertCircle className="w-4 h-4" />
                            Changes affect standings compile immediately.
                        </div>
                        <Button
                            onClick={saveConfig}
                            disabled={actionLoading === 'save-config'}
                            className="h-10 bg-amber-500 hover:bg-amber-400 text-black px-8 font-bold text-sm shadow-[0_4px_12px_rgba(245,158,11,0.2)] disabled:opacity-50"
                        >
                            {actionLoading === 'save-config' ? 'Saving...' : 'Apply Configuration'}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10">
                    <Settings className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-20" />
                    <p className="text-sm text-slate-500 font-medium tracking-tight">
                        {configSeasons.length === 0 && selectedConfigLeagueId
                            ? 'No imported seasons found for this league.'
                            : 'Select a league and season to manage its settings.'}
                    </p>
                </div>
            )}
        </section>
    );
};
