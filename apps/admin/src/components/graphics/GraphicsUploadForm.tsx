import type { GraphicType } from './types';
import type { UploadStatus } from './useGraphics';

import React, { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

import { GRAPHIC_TYPES } from './types';
import { registerOrAutoSideloadGraphic } from './useGraphics';

interface Props {
    onUploaded: () => void;
}

export const GraphicsUploadForm: React.FC<Props> = ({ onUploaded }) => {
    const [uploadType, setUploadType] = useState<GraphicType>('team');
    const [uploadEntityId, setUploadEntityId] = useState('');
    const [uploadUrl, setUploadUrl] = useState('');
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploadStatus('loading');
        try {
            const ok = await registerOrAutoSideloadGraphic(uploadType, uploadEntityId, uploadUrl);
            if (ok) {
                setUploadStatus('success');
                setUploadEntityId('');
                setUploadUrl('');
                setTimeout(() => setUploadStatus('idle'), 3000);
                onUploaded();
            } else {
                setUploadStatus('error');
            }
        } catch (err) {
            console.error(err);
            setUploadStatus('error');
        }
    };

    return (
        <div className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
            <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-3">
                <Upload className="w-5 h-5 text-sky-400" />
                Register Graphic
            </h3>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed font-normal">
                Provide just an Entity UUID to automatically resolve and fetch the corresponding
                graphic, or supply a manual Source Image URL. The image will be downloaded, hashed
                for deduplication, and stored in the Supabase bucket. For players, provide their
                numerical Source ID as the UUID.
            </p>

            <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Entity Type</label>
                    <select
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 transition-all"
                        value={uploadType}
                        onChange={(e) => setUploadType(e.target.value as GraphicType)}
                    >
                        {GRAPHIC_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Entity UUID</label>
                    <input
                        type="text"
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 transition-all font-mono"
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        value={uploadEntityId}
                        onChange={(e) => setUploadEntityId(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-semibold text-slate-400 flex justify-between">
                        Source Image URL
                        <span className="text-slate-500 font-normal">Optional for Auto-Fetch</span>
                    </label>
                    <div className="flex gap-4">
                        <input
                            type="url"
                            className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 transition-all font-mono"
                            placeholder="Leave blank to auto-fetch..."
                            value={uploadUrl}
                            onChange={(e) => setUploadUrl(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={uploadStatus === 'loading'}
                            className="bg-sky-500 hover:bg-sky-400 text-white px-8 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 transition-all whitespace-nowrap"
                        >
                            {uploadStatus === 'loading' ? (
                                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                            ) : uploadUrl.trim() ? (
                                'Sideload'
                            ) : (
                                'Auto-Fetch'
                            )}
                        </button>
                    </div>
                </div>
            </form>
            {uploadStatus === 'success' && (
                <p className="text-emerald-400 text-xs mt-4">✓ Sideloaded completely.</p>
            )}
            {uploadStatus === 'error' && (
                <p className="text-red-400 text-xs mt-4">Failed to sideload.</p>
            )}
        </div>
    );
};
