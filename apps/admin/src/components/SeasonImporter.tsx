import React from 'react';
import { Globe, History, CheckCircle2, Loader2, Play } from 'lucide-react';

import type { CatalogLeague, Season, ManagedLeague } from './LeaguesManagementView';

interface SeasonImporterProps {
    managedLeagues: ManagedLeague[];
    selectedCatalogLeagueId: string;
    setSelectedCatalogLeagueId: (id: string) => void;
    catalogLeagueMetadata: CatalogLeague | null;
    seasonsForCatalogLeague: Season[];
    importSeason: (leagueId: string, year: number) => void;
    removeSeason: (leagueId: string, seasonId: string, year: number) => void;
    actionLoading: string | null;
}

export const SeasonImporter: React.FC<SeasonImporterProps> = ({
    managedLeagues,
    selectedCatalogLeagueId,
    setSelectedCatalogLeagueId,
    catalogLeagueMetadata,
    seasonsForCatalogLeague,
    importSeason,
    removeSeason,
    actionLoading
}) => {
    return (
        <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm space-y-8 relative overflow-hidden group/box2 transition-all hover:border-slate-800">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
                <div>
                    <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                        <History className="w-5 h-5 text-indigo-400" />
                        Season Importer
                    </h3>
                    <p className="text-sm text-slate-400 mt-2">Browse provider years and import them as local seasons.</p>
                </div>
                <select
                    value={selectedCatalogLeagueId}
                    onChange={(e) => setSelectedCatalogLeagueId(e.target.value)}
                    className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all min-w-[200px]"
                >
                    <option value="">Select League...</option>
                    {managedLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            </div>

            {selectedCatalogLeagueId ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 relative z-10">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center p-1.5 overflow-hidden">
                                {managedLeagues.find(l => l.id === selectedCatalogLeagueId)?.logo ? (
                                    <img
                                        src={managedLeagues.find(l => l.id === selectedCatalogLeagueId)?.logo}
                                        className="w-full h-full object-contain opacity-80"
                                        alt=""
                                    />
                                ) : (
                                    <div className="w-full h-full bg-slate-800/50 flex items-center justify-center">
                                        <Globe className="w-5 h-5 text-slate-700" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Provider Catalog</h4>
                                <p className="text-xs text-white font-medium">{managedLeagues.find(l => l.id === selectedCatalogLeagueId)?.name}</p>
                            </div>
                        </div>

                        {/* <button
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors border border-slate-700"
                        >
                            Refresh Catalog metadata
                        </button> */}
                    </div>

                    <div className="overflow-hidden border border-slate-800/40 rounded-xl bg-slate-900/20 backdrop-blur-sm">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-slate-900/50 border-b border-slate-800/60">
                                    <th className="px-6 py-4 font-semibold text-slate-400">Year</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 text-center">Status</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {catalogLeagueMetadata?.seasons?.map((s: Season) => {
                                    const localSeason = seasonsForCatalogLeague.find(ls => ls.year === s.year);
                                    const isImported = !!localSeason;
                                    const isLoading = actionLoading === `${selectedCatalogLeagueId}-${s.year}`;

                                    return (
                                        <tr key={s.year} className="hover:bg-slate-800/20 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-medium text-slate-200">{s.year} Season</span>
                                                    {s.current && (
                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                            Current
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {isImported ? (
                                                    <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold px-2 py-1 bg-emerald-400/10 rounded-md border border-emerald-400/20">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Imported
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500 text-xs font-medium">Available</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {isLoading ? (
                                                    <div className="flex items-center justify-end gap-2 text-indigo-400 text-xs font-semibold">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Processing...
                                                    </div>
                                                ) : isImported ? (
                                                    <button
                                                        onClick={() => removeSeason(selectedCatalogLeagueId, localSeason.id, s.year)}
                                                        className="text-xs font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-400/10 px-3 py-1.5 rounded-lg transition-all"
                                                    >
                                                        Remove
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => importSeason(selectedCatalogLeagueId, s.year)}
                                                        className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-1.5 rounded-lg font-bold text-xs transition-all shadow-sm"
                                                    >
                                                        <Play className="w-3 h-3" />
                                                        Import
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {!catalogLeagueMetadata && (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                                            <div className="flex flex-col items-center gap-3">
                                                <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
                                                <span className="text-xs font-medium">Loading catalog data...</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="py-20 text-center border border-dashed border-slate-800/40 rounded-xl bg-slate-900/10 relative z-10 group/empty">
                    <History className="w-8 h-8 text-slate-700 mx-auto mb-4 opacity-20 group-hover/empty:scale-110 group-hover/empty:text-indigo-500 transition-all duration-500" />
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Select a managed league to browse its available seasons.</p>
                </div>
            )}
        </section>
    );
};
