import React, { useState } from 'react';
import { AlertCircle, Database, Globe } from 'lucide-react';

import { gqlFetch } from '../lib/api';
import { cn } from '../utils';

interface ConfigStatus {
    isDatabaseConnected: boolean;
    apiFootballKeyMasked: string | null;
    databaseUrlMasked: string | null;
    supabaseUrlMasked: string | null;
    supabaseAnonKeyMasked: string | null;
}

const DatabaseView = ({
    config,
    onUpdate,
}: {
    config: ConfigStatus | null;
    onUpdate: () => void;
}) => {
    const [dbUrl, setDbUrl] = useState('');
    const [sUrl, setSUrl] = useState('');
    const [sKey, setSKey] = useState('');
    const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [sStatus, setSStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const onConfigureDb = async (e: React.FormEvent) => {
        e.preventDefault();
        setDbStatus('loading');
        try {
            const data = await gqlFetch<{ configureDatabase: boolean }>(
                `mutation Configure($url: String!) { configureDatabase(url: $url) }`,
                { url: dbUrl },
            );
            if (data.configureDatabase) {
                setDbStatus('success');
                setDbUrl('');
                setTimeout(() => setDbStatus('idle'), 3000);
                onUpdate();
            } else {
                setDbStatus('error');
            }
        } catch (err) {
            console.error(err);
            setDbStatus('error');
        }
    };

    const onConfigureSupabase = async (e: React.FormEvent) => {
        e.preventDefault();
        setSStatus('loading');
        try {
            const data = await gqlFetch<{ configureSupabase: boolean }>(
                `mutation ConfigureSup($url: String!, $key: String!) { configureSupabase(url: $url, anonKey: $key) }`,
                { url: sUrl, key: sKey },
            );
            if (data.configureSupabase) {
                setSStatus('success');
                setSUrl('');
                setSKey('');
                setTimeout(() => setSStatus('idle'), 3000);
                onUpdate();
            } else {
                setSStatus('error');
            }
        } catch (err) {
            console.error(err);
            setSStatus('error');
        }
    };

    return (
        <div className="max-w-4xl space-y-16 pb-24">
            {/* Database Setup */}
            <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
                <div className="flex items-center gap-5 mb-10">
                    <div
                        className={cn(
                            'p-4 rounded-xl shadow-sm transition-colors',
                            config?.isDatabaseConnected
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-red-500/10 text-red-500',
                        )}
                    >
                        <Database className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-white">PostgreSQL Connection</h3>
                        <p className="text-sm text-slate-400 mt-1">
                            The primary relational store for engine data.
                        </p>
                    </div>
                </div>

                <div className="bg-slate-900/40 rounded-xl p-6 mb-10 border border-slate-800/40">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Active Connection String
                        </span>
                        <span
                            className={cn(
                                'text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                                config?.isDatabaseConnected
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : 'bg-red-500/10 text-red-500',
                            )}
                        >
                            {config?.isDatabaseConnected ? 'Live' : 'Inactive'}
                        </span>
                    </div>
                    <code className="text-xs font-mono text-slate-400 block break-all leading-relaxed">
                        {config?.databaseUrlMasked || 'No direct connection has been mapped yet.'}
                    </code>
                </div>

                <form onSubmit={onConfigureDb} className="space-y-6">
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-400">
                            Connection Endpoint
                        </label>
                        <input
                            type="text"
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-sky-500/50 focus:outline-none transition-all font-mono"
                            placeholder="postgresql://user:pass@host:port/dbname"
                            value={dbUrl}
                            onChange={(e) => setDbUrl(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex items-center gap-6">
                        <button
                            type="submit"
                            disabled={dbStatus === 'loading'}
                            className="bg-white text-black px-8 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-200 transition-all"
                        >
                            {dbStatus === 'loading' ? 'Verifying...' : 'Commit Changes'}
                        </button>
                        {dbStatus === 'success' && (
                            <p className="text-emerald-400 text-xs font-medium">
                                Write successful. Restarting engine.
                            </p>
                        )}
                        {dbStatus === 'error' && (
                            <p className="text-red-400 text-xs font-medium">
                                Connection test failed.
                            </p>
                        )}
                    </div>
                </form>
            </section>

            {/* Supabase SDK */}
            <section className="bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm">
                <div className="flex items-center gap-5 mb-10">
                    <div className="p-4 bg-emerald-500/10 rounded-xl text-emerald-500 shadow-sm">
                        <Globe className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-white">
                            Supabase Cloud Platform
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                            Cloud primitives for storage and real-time synchronization.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                    <div className="bg-slate-900/40 p-5 rounded-xl border border-slate-800/40">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Project Host
                        </p>
                        <p className="text-xs font-mono text-slate-400">
                            {config?.supabaseUrlMasked || 'Pending'}
                        </p>
                    </div>
                    <div className="bg-slate-900/40 p-5 rounded-xl border border-slate-800/40">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Public Access Key
                        </p>
                        <p className="text-xs font-mono text-slate-400">
                            {config?.supabaseAnonKeyMasked || 'Pending'}
                        </p>
                    </div>
                </div>

                <form onSubmit={onConfigureSupabase} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-slate-400">
                                Project Endpoint
                            </label>
                            <input
                                type="text"
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all font-mono"
                                placeholder="https://project.supabase.co"
                                value={sUrl}
                                onChange={(e) => setSUrl(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-slate-400">
                                Anon Key / Service Key
                            </label>
                            <input
                                type="password"
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all font-mono"
                                placeholder="eyJhbG..."
                                value={sKey}
                                onChange={(e) => setSKey(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <button
                            type="submit"
                            disabled={sStatus === 'loading'}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm shadow-emerald-600/10"
                        >
                            {sStatus === 'loading' ? 'Encrypting...' : 'Sync Credentials'}
                        </button>
                        {sStatus === 'success' && (
                            <p className="text-emerald-400 text-xs font-medium">
                                SDK initialized successfully.
                            </p>
                        )}
                        {sStatus === 'error' && (
                            <p className="text-red-400 text-xs font-medium">Validation failed.</p>
                        )}
                    </div>
                </form>
            </section>

            <div className="bg-slate-900/20 border border-slate-800/40 p-8 rounded-2xl flex gap-6 items-start">
                <AlertCircle className="w-5 h-5 text-slate-500 mt-1" />
                <p className="text-sm text-slate-400 leading-relaxed max-w-3xl font-normal">
                    All configuration updates are written to the{' '}
                    <code className="text-emerald-400 font-mono">.env</code> file. The service will
                    automatically cycle and re-initialize connections upon detection of environment
                    changes.
                </p>
            </div>
        </div>
    );
};

export default DatabaseView;
