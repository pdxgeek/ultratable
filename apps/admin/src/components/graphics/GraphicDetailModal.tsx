import type { Graphic } from './types';

import React from 'react';
import { Image as ImageIcon, X } from 'lucide-react';

interface Props {
    graphic: Graphic;
    onClose: () => void;
}

export const GraphicDetailModal: React.FC<Props> = ({ graphic, onClose }) => (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200"
        onClick={onClose}
    >
        <div
            className="bg-[#0d1117] border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between p-4 border-b border-slate-800/60 bg-slate-900/50">
                <h3 className="text-lg font-semibold text-white capitalize flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-sky-400" />
                    {graphic.entityType} Graphic Details
                </h3>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-md hover:bg-slate-800 bg-slate-900"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
            <div className="p-6 overflow-y-auto flex flex-col md:flex-row gap-8">
                <div className="w-full md:w-1/2 aspect-square bg-slate-900/50 rounded-2xl p-6 flex items-center justify-center relative overflow-hidden border border-slate-800/60 shadow-inner">
                    <div className="absolute inset-0 bg-grid-slate-800/[0.2] bg-[size:12px_12px]" />
                    <img
                        src={graphic.url}
                        alt="Selected Graphic"
                        className="max-w-full max-h-full object-contain relative z-10 drop-shadow-2xl"
                    />
                </div>

                <div className="w-full md:w-1/2 space-y-5">
                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/40 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                    Entity ID
                                </label>
                                <div className="bg-[#0d1117] border border-slate-700/50 p-2.5 rounded-lg">
                                    <p className="font-mono text-sm text-sky-400 break-all">
                                        {graphic.entityId}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                    Entity Type
                                </label>
                                <div className="bg-[#0d1117] border border-slate-700/50 p-2.5 rounded-lg flex items-center h-full max-h-[42px]">
                                    <p className="font-mono text-sm text-emerald-400 capitalize">
                                        {graphic.entityType}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                    MIME Type
                                </label>
                                <p className="text-sm text-slate-300 font-medium">
                                    {graphic.mimeType}
                                </p>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                    Internal ID
                                </label>
                                <p
                                    className="font-mono text-xs text-slate-400 break-all truncate"
                                    title={graphic.id}
                                >
                                    {graphic.id}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                Original Source URL
                            </label>
                            <div className="bg-[#0d1117] border border-slate-700/50 p-2.5 rounded-lg flex items-center justify-between">
                                <p
                                    className="font-mono text-xs text-sky-400/80 truncate pr-4"
                                    title={graphic.sourceUrl || 'Not tracked'}
                                >
                                    {graphic.sourceUrl || 'No source URL tracked'}
                                </p>
                                {graphic.sourceUrl && (
                                    <a
                                        href={graphic.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold text-indigo-400/80 hover:text-indigo-400 transition-colors uppercase tracking-widest whitespace-nowrap"
                                    >
                                        Open
                                    </a>
                                )}
                            </div>
                        </div>

                        {graphic.createdAt && (
                            <div className="mt-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                    Ingested Timestamp
                                </label>
                                <p className="font-mono text-xs text-slate-400">
                                    {new Date(graphic.createdAt).toLocaleString()}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/40 flex-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                            Metadata JSON
                        </label>
                        <div className="bg-[#0d1117] border border-slate-800 p-4 rounded-lg overflow-x-auto">
                            <pre className="text-xs font-mono text-emerald-400/90 whitespace-pre-wrap leading-relaxed">
                                {graphic.metadata
                                    ? JSON.stringify(graphic.metadata, null, 2)
                                    : '{\n  "info": "No metadata available."\n}'}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);
