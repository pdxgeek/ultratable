import type { GraphicType } from './types';
import type { UploadStatus } from './useGraphics';

import React, { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { GRAPHIC_TYPES } from './types';
import { registerOrAutoSideloadGraphic } from './useGraphics';

interface Props {
    onUploaded: () => void;
}

const fieldClass =
    'h-12 bg-slate-900/50 border-slate-700/50 text-white placeholder:text-slate-600 focus-visible:border-sky-500/50 focus-visible:ring-0 font-mono';

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
        <Card className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl ring-0 gap-0">
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
                    <Label htmlFor="upload-type" className="text-xs font-semibold text-slate-400">
                        Entity Type
                    </Label>
                    <Select
                        value={uploadType}
                        onValueChange={(v) => setUploadType(v as GraphicType)}
                    >
                        <SelectTrigger id="upload-type" className={`w-full ${fieldClass}`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {GRAPHIC_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="upload-uuid" className="text-xs font-semibold text-slate-400">
                        Entity UUID
                    </Label>
                    <Input
                        id="upload-uuid"
                        type="text"
                        className={fieldClass}
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        value={uploadEntityId}
                        onChange={(e) => setUploadEntityId(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <Label
                        htmlFor="upload-url"
                        className="text-xs font-semibold text-slate-400 justify-between"
                    >
                        Source Image URL
                        <span className="text-slate-500 font-normal">Optional for Auto-Fetch</span>
                    </Label>
                    <div className="flex gap-4">
                        <Input
                            id="upload-url"
                            type="url"
                            className={`flex-1 ${fieldClass}`}
                            placeholder="Leave blank to auto-fetch..."
                            value={uploadUrl}
                            onChange={(e) => setUploadUrl(e.target.value)}
                        />
                        <Button
                            type="submit"
                            disabled={uploadStatus === 'loading'}
                            className="h-12 bg-sky-500 hover:bg-sky-400 text-white px-8 font-semibold text-sm disabled:opacity-50 whitespace-nowrap"
                        >
                            {uploadStatus === 'loading' ? (
                                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                            ) : uploadUrl.trim() ? (
                                'Sideload'
                            ) : (
                                'Auto-Fetch'
                            )}
                        </Button>
                    </div>
                </div>
            </form>
            {uploadStatus === 'success' && (
                <p className="text-emerald-400 text-xs mt-4">✓ Sideloaded completely.</p>
            )}
            {uploadStatus === 'error' && (
                <p className="text-red-400 text-xs mt-4">Failed to sideload.</p>
            )}
        </Card>
    );
};
