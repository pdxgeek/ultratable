import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Key } from 'lucide-react';

import { gqlFetch } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ApiKeyViewProps {
    onUpdate: () => void;
    currentKeyMasked?: string | null;
}

const ApiKeyView = ({ onUpdate, currentKeyMasked }: ApiKeyViewProps) => {
    const [value, setValue] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const onConfigure = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMessage(null);
        try {
            const data = await gqlFetch<{ configureApiKey: boolean }>(
                `mutation ConfigureKey($key: String!) { configureApiKey(key: $key) }`,
                { key: value },
            );

            if (data.configureApiKey) {
                setStatus('success');
                setValue('');
                setTimeout(() => setStatus('idle'), 3000);
                // Service restarts when .env changes; give it a moment before refreshing config status.
                setTimeout(onUpdate, 1500);
            } else {
                setStatus('error');
                setErrorMessage('Server reported the write did not complete.');
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
            setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    return (
        <div className="max-w-3xl space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Card className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl ring-0 gap-0">
                <h3 className="text-lg font-semibold text-white mb-2">API-Football Credentials</h3>
                <p className="text-sm text-slate-400 mb-8 leading-relaxed font-normal">
                    Provide your API-Football authentication key from{' '}
                    <a
                        className="text-sky-400 hover:underline"
                        href="https://dashboard.api-football.com/"
                        target="_blank"
                        rel="noreferrer"
                    >
                        dashboard.api-football.com
                    </a>
                    . It is written to the service&apos;s environment and used for all subsequent
                    data fetches.
                </p>

                <div className="bg-slate-900/30 border border-slate-800/60 rounded-lg px-4 py-3 mb-8 flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                            Current key
                        </div>
                        <div className="font-mono text-sm text-slate-300 mt-1">
                            {currentKeyMasked ?? (
                                <span className="text-slate-500 italic">not set</span>
                            )}
                        </div>
                    </div>
                    {currentKeyMasked ? (
                        <span className="text-emerald-400 text-xs font-medium flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Configured
                        </span>
                    ) : (
                        <span className="text-amber-400 text-xs font-medium flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Not configured
                        </span>
                    )}
                </div>

                <form onSubmit={onConfigure} className="space-y-8">
                    <div className="space-y-3">
                        <Label
                            htmlFor="api-key"
                            className="text-xs font-semibold text-slate-400"
                        >
                            <Key className="w-3.5 h-3.5" />
                            API-Football Key
                        </Label>
                        <Input
                            id="api-key"
                            type="password"
                            className="h-12 bg-slate-900/50 border-slate-700/50 text-white placeholder:text-slate-600 focus-visible:ring-0 font-mono"
                            placeholder="e.g. 29da7bc40b13..."
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            required
                        />
                    </div>

                    <div className="flex items-center gap-6 pt-2">
                        <Button
                            type="submit"
                            disabled={status === 'loading'}
                            className="h-10 bg-sky-500 hover:bg-sky-400 text-white px-8 font-semibold text-sm disabled:opacity-50 shadow-sm shadow-sky-500/10"
                        >
                            {status === 'loading' ? 'Saving...' : 'Update Integration'}
                        </Button>

                        {status === 'success' && (
                            <span className="text-emerald-400 text-xs font-medium flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Key saved
                            </span>
                        )}

                        {status === 'error' && (
                            <span className="text-red-400 text-xs font-medium flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {errorMessage || 'Save failed'}
                            </span>
                        )}
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default ApiKeyView;
