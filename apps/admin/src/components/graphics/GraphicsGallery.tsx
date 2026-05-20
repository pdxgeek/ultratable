import React from 'react';
import { Search, Image as ImageIcon, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { GRAPHIC_TYPES, type Graphic, type GraphicType } from './types';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface Props {
    graphics: Graphic[];
    loading: boolean;
    search: string;
    setSearch: (val: string) => void;
    typeFilter: GraphicType | 'all';
    setTypeFilter: (val: GraphicType | 'all') => void;
    onSelect: (g: Graphic) => void;
}

export const GraphicsGallery: React.FC<Props> = ({
    graphics, loading,
    search, setSearch,
    typeFilter, setTypeFilter,
    onSelect,
}) => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 bg-[#0d1117] border border-slate-800/60 p-2 rounded-xl">
                    <button
                        className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", typeFilter === 'all' ? "bg-sky-500/20 text-sky-400" : "text-slate-400 hover:text-slate-200")}
                        onClick={() => setTypeFilter('all')}
                    >
                        All Types
                    </button>
                    {GRAPHIC_TYPES.map(t => (
                        <button
                            key={t}
                            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize", typeFilter === t ? "bg-sky-500/20 text-sky-400" : "text-slate-400 hover:text-slate-200")}
                            onClick={() => setTypeFilter(t)}
                        >
                            {t}s
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search by ID..."
                        className="bg-slate-900/50 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 transition-all w-full md:w-64"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="py-32 text-center text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-sky-500" />
                    <p className="text-sm font-medium tracking-wide">Syncing Registry...</p>
                </div>
            ) : graphics.length === 0 ? (
                <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-3xl">
                    <ImageIcon className="w-8 h-8 text-slate-600 mx-auto mb-4" />
                    <p className="text-sm font-medium tracking-wide text-slate-500">No graphics found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                    {graphics.map(g => (
                        <button
                            key={g.id}
                            type="button"
                            className="bg-[#0d1117] border border-slate-800/60 rounded-xl overflow-hidden hover:border-sky-500/50 transition-all group flex flex-col cursor-pointer hover:shadow-[0_0_15px_rgba(14,165,233,0.15)] text-left"
                            onClick={() => onSelect(g)}
                        >
                            <div className="aspect-square bg-slate-900/50 p-4 flex items-center justify-center relative">
                                <div className="absolute inset-0 bg-grid-slate-800/[0.2] bg-[size:8px_8px]" />
                                <img
                                    src={g.url}
                                    alt="Graphic"
                                    className="max-w-full max-h-full object-contain relative z-10 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                                    loading="lazy"
                                />
                            </div>
                            <div className="p-3 border-t border-slate-800/60 bg-[#0d1117] flex-1">
                                <p className="text-[10px] font-mono text-slate-500 truncate mb-1" title={g.entityId}>{g.entityId}</p>
                                <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                                    <span className="text-slate-400">{g.entityType}</span>
                                    <span className="text-sky-500/50">PNG</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
