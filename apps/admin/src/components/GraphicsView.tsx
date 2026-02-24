import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Search, Image as ImageIcon, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
    return twMerge(clsx(inputs));
}

type GraphicType = 'team' | 'venue' | 'player' | 'league';
const GRAPHIC_TYPES: GraphicType[] = ['team', 'venue', 'player', 'league'];

interface Graphic {
    id: string;
    entityType: string;
    entityId: string;
    url: string;
    mimeType: string;
}

export const GraphicsView: React.FC = () => {
    const [graphics, setGraphics] = useState<Graphic[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<GraphicType | 'all'>('all');

    // Upload form state
    const [uploadType, setUploadType] = useState<GraphicType>('team');
    const [uploadEntityId, setUploadEntityId] = useState('');
    const [uploadUrl, setUploadUrl] = useState('');
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const fetchGraphics = async () => {
        setLoading(true);
        try {
            // Fetch all types or just the selected one
            const typesToFetch = typeFilter === 'all' ? GRAPHIC_TYPES : [typeFilter];
            let allGraphics: Graphic[] = [];

            for (const t of typesToFetch) {
                const resp = await fetch('/graphql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: `query GetGraphics($type: String!) { graphics(entityType: $type) { id entityType entityId url mimeType } }`,
                        variables: { type: t }
                    })
                });
                const json = await resp.json();
                if (json.data?.graphics) {
                    allGraphics = [...allGraphics, ...json.data.graphics];
                }
            }
            setGraphics(allGraphics);
        } catch (e) {
            console.error('Failed to fetch graphics:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGraphics();
    }, [typeFilter]);

    const filteredGraphics = useMemo(() => {
        return graphics.filter(g => g.entityId.toLowerCase().includes(search.toLowerCase()));
    }, [graphics, search]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploadStatus('loading');
        try {
            const resp = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `mutation RegisterGraph($entityId: String!, $entityType: String!, $url: String!) { 
                        registerGraphic(entityId: $entityId, entityType: $entityType, url: $url) 
                    }`,
                    variables: { entityId: uploadEntityId, entityType: uploadType, url: uploadUrl }
                })
            });
            const json = await resp.json();
            if (json.data?.registerGraphic) {
                setUploadStatus('success');
                setUploadEntityId('');
                setUploadUrl('');
                setTimeout(() => setUploadStatus('idle'), 3000);
                fetchGraphics();
            } else {
                setUploadStatus('error');
            }
        } catch (err) {
            console.error(err);
            setUploadStatus('error');
        }
    };

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-7xl mx-auto">

            {/* Upload Section */}
            <div className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
                <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-3">
                    <Upload className="w-5 h-5 text-sky-400" />
                    Register Graphic
                </h3>
                <p className="text-sm text-slate-400 mb-8 leading-relaxed font-normal">
                    Manually register a graphic by URL. The image will be downloaded, hashed for deduplication, and stored in the Supabase bucket.
                </p>

                <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400">Entity Type</label>
                        <select
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 transition-all"
                            value={uploadType}
                            onChange={e => setUploadType(e.target.value as GraphicType)}
                        >
                            {GRAPHIC_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400">Entity UUID</label>
                        <input
                            type="text"
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 transition-all font-mono"
                            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                            value={uploadEntityId}
                            onChange={e => setUploadEntityId(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-400">Source Image URL</label>
                        <div className="flex gap-4">
                            <input
                                type="url"
                                className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 transition-all font-mono"
                                placeholder="https://media.api-sports.io/..."
                                value={uploadUrl}
                                onChange={e => setUploadUrl(e.target.value)}
                                required
                            />
                            <button
                                type="submit"
                                disabled={uploadStatus === 'loading'}
                                className="bg-sky-500 hover:bg-sky-400 text-white px-8 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 transition-all whitespace-nowrap"
                            >
                                {uploadStatus === 'loading' ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Sideload'}
                            </button>
                        </div>
                    </div>
                </form>
                {uploadStatus === 'success' && <p className="text-emerald-400 text-xs mt-4">✓ Sideloaded completely.</p>}
                {uploadStatus === 'error' && <p className="text-red-400 text-xs mt-4">Failed to sideload.</p>}
            </div>

            {/* Gallery Section */}
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
                ) : filteredGraphics.length === 0 ? (
                    <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-3xl">
                        <ImageIcon className="w-8 h-8 text-slate-600 mx-auto mb-4" />
                        <p className="text-sm font-medium tracking-wide text-slate-500">No graphics found.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                        {filteredGraphics.map(g => (
                            <div key={g.id} className="bg-[#0d1117] border border-slate-800/60 rounded-xl overflow-hidden hover:border-slate-600 transition-all group flex flex-col">
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
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
