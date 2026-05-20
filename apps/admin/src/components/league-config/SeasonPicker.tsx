import React from 'react';
import { Calendar, RefreshCw, Loader2, Database } from 'lucide-react';
import type { Season } from '../leagues.types';

interface Props {
    configSeasons: Season[];
    selectedConfigSeasonId: string;
    setSelectedConfigSeasonId: (id: string) => void;
    onSync: () => void;
    syncing: boolean;
}

export const SeasonPicker: React.FC<Props> = ({
    configSeasons,
    selectedConfigSeasonId,
    setSelectedConfigSeasonId,
    onSync,
    syncing,
}) => {
    const selected = configSeasons.find(s => s.id === selectedConfigSeasonId);
    return (
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
                    onClick={onSync}
                    disabled={syncing || !selectedConfigSeasonId}
                    className="mt-6 flex items-center gap-2 px-6 py-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 rounded-lg transition-all font-bold text-xs uppercase tracking-wider disabled:opacity-30"
                >
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {syncing ? 'Syncing...' : 'Sync Season'}
                </button>
            </div>

            <div className="flex items-baseline gap-1.5">
                <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Database className="w-3 h-3" /> Data Volume
                    </h4>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-white">{selected?.fixtureCount || 0}</span>
                        <span className="text-[10px] text-slate-500 font-medium">Fixtures</span>
                    </div>
                    <div className="w-px h-4 bg-slate-800" />
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-white">{selected?.teamCount || 0}</span>
                        <span className="text-[10px] text-slate-500 font-medium">Teams</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
