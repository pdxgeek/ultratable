import React from 'react';
import { Database, RefreshCw, Calendar, Globe, AlertCircle, Loader2, Settings } from 'lucide-react';

import type { Season, ManagedLeague } from './LeaguesManagementView';
import type { Job, Execution } from './WorkersView';


interface LeagueConfigProps {
    managedLeagues: ManagedLeague[];
    selectedConfigLeagueId: string;
    setSelectedConfigLeagueId: (id: string) => void;
    setConfigTab: (tab: 'league' | 'season') => void;
    configTab: 'league' | 'season';
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
    deductions: string;
    setDeductions: (val: string) => void;
    helperTeamId: string;
    setHelperTeamId: (val: string) => void;
    configTeams: Record<string, unknown>[];
    helperPoints: number;
    setHelperPoints: (val: number) => void;
    helperReason: string;
    setHelperReason: (val: string) => void;
    saveConfig: () => void;
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
    promoInput, setPromoInput,
    playoffInput, setPlayoffInput,
    relInput, setRelInput,
    deductions, setDeductions,
    helperTeamId, setHelperTeamId,
    configTeams,
    helperPoints, setHelperPoints,
    helperReason, setHelperReason,
    saveConfig
}) => {
    return (
        <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm space-y-8 relative overflow-hidden group/box3 transition-all hover:border-slate-800">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
                <div>
                    <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                        <Database className="w-5 h-5 text-amber-500" />
                        Box 3: Configuration & Data Sync
                    </h3>
                    <p className="text-sm text-slate-400 mt-2">Manage settings, sync fixtures, and configure standings rules.</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={selectedConfigLeagueId}
                        onChange={(e) => {
                            setSelectedConfigLeagueId(e.target.value);
                            setConfigTab('league');
                        }}
                        className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-all min-w-[200px]"
                    >
                        <option value="">Select League...</option>
                        {managedLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </div>
            </div>

            {selectedConfigLeagueId ? (
                <div className="space-y-8 relative z-10 animate-in fade-in duration-300">
                    {/* Tabs */}
                    <div className="flex border-b border-slate-800/60 pb-4">
                        <button
                            onClick={() => setConfigTab('league')}
                            className={`px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors ${configTab === 'league' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            League Defaults
                        </button>
                        <button
                            onClick={() => setConfigTab('season')}
                            className={`px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors ${configTab === 'season' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Season Overrides
                        </button>
                    </div>

                    {configTab === 'season' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800/40">
                                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50">
                                    <Calendar className="w-5 h-5 text-amber-500" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1.5">Select Season to Override</h4>
                                    <select
                                        value={selectedConfigSeasonId}
                                        onChange={(e) => setSelectedConfigSeasonId(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                                    >
                                        <option value="">-- Choose Season --</option>
                                        {configSeasons.map(s => <option key={s.id} value={s.id}>{s.year} Season</option>)}
                                    </select>
                                </div>
                                <button
                                    onClick={() => {
                                        const s = configSeasons.find(s => s.id === selectedConfigSeasonId);
                                        if (s) syncSeasonData(selectedConfigLeagueId, s.year);
                                    }}
                                    disabled={actionLoading?.startsWith('sync-') || !selectedConfigSeasonId}
                                    className="mt-6 flex items-center gap-2 px-6 py-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 rounded-lg transition-all font-bold text-xs uppercase tracking-wider disabled:opacity-30"
                                >
                                    {actionLoading?.startsWith('sync-') ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4" />
                                    )}
                                    {actionLoading?.startsWith('sync-') ? 'Syncing...' : 'Sync Season'}
                                </button>
                            </div>

                            <div className="flex flex-col gap-4 w-full">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-8">
                                        <div className="space-y-1">
                                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <Database className="w-3 h-3" /> Data Volume
                                            </h4>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-xl font-bold text-white">
                                                    {configSeasons.find(s => s.id === selectedConfigSeasonId)?.fixtureCount || 0}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-medium">Fixtures</span>
                                            </div>
                                            <div className="w-px h-4 bg-slate-800" />
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-xl font-bold text-white">
                                                    {configSeasons.find(s => s.id === selectedConfigSeasonId)?.teamCount || 0}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-medium">Teams</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {configTab === 'league' && (
                        <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800/40">
                            <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50">
                                <Globe className="w-5 h-5 text-amber-500" />
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1.5">League Target</h4>
                                <div className="text-sm font-semibold text-white px-2 py-1">{managedLeagues.find(l => l.id === selectedConfigLeagueId)?.name}</div>
                            </div>
                        </div>
                    )}

                    {/* Promo / Rel / Playoff UI */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Promotion Spots</label>
                            <input
                                type="text"
                                value={promoInput}
                                onChange={(e) => setPromoInput(e.target.value)}
                                placeholder="e.g. 1, 2"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-emerald-400 font-mono focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Playoff Spots</label>
                            <input
                                type="text"
                                value={playoffInput}
                                onChange={(e) => setPlayoffInput(e.target.value)}
                                placeholder="e.g. 3, 4, 5, 6"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-sky-400 font-mono focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Relegation Spots</label>
                            <input
                                type="text"
                                value={relInput}
                                onChange={(e) => setRelInput(e.target.value)}
                                placeholder="e.g. 18, 19, 20"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-red-400 font-mono focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700"
                            />
                        </div>
                    </div>

                    {/* Progress Bar for Sync */}
                    {(() => {
                        const activeJob = configTab === 'season' ? executions.find(ex =>
                            ex.status === 'running' &&
                            ex.jobId === jobs.find(j => j.name === `sync-fixtures-${managedLeagues.find(l => l.id === selectedConfigLeagueId)?.sourceId}-${configSeasons.find(s => s.id === selectedConfigSeasonId)?.year}`)?.id
                        ) : null;

                        if (activeJob && (activeJob.totalCount || 0) > 0) {
                            const percent = Math.round((activeJob.processedCount / (activeJob.totalCount || 1)) * 100);
                            return (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                                        <span>Synchronizing Fixtures...</span>
                                        <span className="font-mono">{activeJob.processedCount} / {activeJob.totalCount} ({percent}%)</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
                                        <div
                                            className="h-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* Deductions UI (Only shown in Season tab) */}
                    {configTab === 'season' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Points Deductions (JSON)</h4>
                                <span className="text-[9px] text-slate-600 font-mono italic">Format: [ {"{"} "teamId": "uuid", "points": 4, "reason": "..." {"}"} ]</span>
                            </div>

                            {/* Helper UI */}
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1 w-full">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Select Team</label>
                                    <select
                                        value={helperTeamId}
                                        onChange={(e) => setHelperTeamId(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                                    >
                                        <option value="">-- Choose a team --</option>
                                        {configTeams.map((t: Record<string, unknown>) => (
                                            <option key={t.id as string} value={t.id as string}>{t.name as string}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-24">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Points</label>
                                    <input
                                        type="number"
                                        value={helperPoints}
                                        onChange={(e) => setHelperPoints(parseInt(e.target.value.toString()) || 0)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                                    />
                                </div>
                                <div className="flex-2 w-full">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Reason</label>
                                    <input
                                        type="text"
                                        value={helperReason}
                                        onChange={(e) => setHelperReason(e.target.value)}
                                        placeholder="e.g. Financial irregularities"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                                    />
                                </div>
                                <button
                                    disabled={!helperTeamId}
                                    onClick={() => {
                                        try {
                                            const currentArray = JSON.parse(deductions || '[]');
                                            if (!Array.isArray(currentArray)) throw new Error('Not an array');
                                            currentArray.push({
                                                teamId: helperTeamId,
                                                points: helperPoints,
                                                reason: helperReason
                                            });
                                            setDeductions(JSON.stringify(currentArray, null, 2));
                                            setHelperTeamId('');
                                            setHelperPoints(0);
                                            setHelperReason('');
                                        } catch {
                                            alert('Current JSON is invalid. Please fix it before using the helper.');
                                        }
                                    }}
                                    className="bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all"
                                >
                                    Add
                                </button>
                            </div>

                            <textarea
                                value={deductions}
                                onChange={(e) => setDeductions(e.target.value)}
                                className="w-full h-48 bg-slate-950/80 border border-slate-800/80 rounded-xl p-6 font-mono text-xs text-sky-300 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10 transition-all mt-4"
                                placeholder='[ { "teamId": "uuid", "points": 0, "reason": "" } ]'
                            />
                        </div>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-800/40 pt-8">
                        <div className="flex items-center gap-4 text-slate-500 text-xs italic">
                            <AlertCircle className="w-4 h-4" />
                            Changes affect standings compile immediately.
                        </div>
                        <button
                            onClick={saveConfig}
                            disabled={actionLoading === 'save-config'}
                            className="bg-amber-500 hover:bg-amber-400 text-black px-8 py-2.5 rounded-lg font-bold text-sm transition-all shadow-[0_4px_12px_rgba(245,158,11,0.2)] disabled:opacity-50"
                        >
                            {actionLoading === 'save-config' ? 'Saving...' : 'Apply Configuration'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10">
                    <Settings className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-20" />
                    <p className="text-sm text-slate-500 font-medium tracking-tight">
                        {configSeasons.length === 0 && selectedConfigLeagueId ? "No imported seasons found for this league." : "Select a league and season to manage its settings."}
                    </p>
                </div>
            )}
        </section>
    );
};
