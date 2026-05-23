import { useState } from 'react';
import { Activity, CheckCircle2, Globe, History, Loader2, Play, Settings } from 'lucide-react';

import { gqlFetch } from '../lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Job {
    id: string;
    name: string;
    isActive: boolean;
    scheduleCron?: string | null;
    lastRunAt?: string | null;
}

export interface Execution {
    id: string;
    jobId: string;
    status: string;
    startedAt: string;
    processedCount: number;
    apiCallsCount: number;
    totalCount?: number;
    errorMessage?: string | null;
}

const WorkersView = ({
    jobs,
    executions,
    loading,
    onRefresh,
}: {
    jobs: Job[];
    executions: Execution[];
    loading: boolean;
    onRefresh: () => Promise<void>;
}) => {
    const [runningJob, setRunningJob] = useState<string | null>(null);

    const runJob = async (name: string) => {
        setRunningJob(name);
        try {
            await gqlFetch(`mutation Run($name: String!) { runJob(name: $name) { id status } }`, {
                name,
            });
            await onRefresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert(`Job failed: ${msg}`);
            console.error(e);
        } finally {
            setRunningJob(null);
        }
    };

    if (loading && jobs.length === 0) {
        return (
            <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-3xl">
                <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-6" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Waking Workers...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex justify-between items-center bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm relative overflow-hidden isolate group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
                <div className="relative z-10">
                    <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                        <Activity className="w-5 h-5 text-sky-400" />
                        Background Service Registry
                    </h3>
                    <p className="text-sm text-slate-400 mt-2 font-normal leading-relaxed max-w-lg">
                        Monitor and manually trigger scheduled tasks. The system utilizes a
                        distributed job runner to ensure data freshless across all providers.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-6">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2">
                        Active Jobs
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                        {jobs.map((job) => (
                            <div
                                key={job.id}
                                className="bg-[#0d1117] border border-slate-800/60 p-6 rounded-2xl hover:border-slate-700 transition-all group flex items-center justify-between shadow-sm"
                            >
                                <div className="flex items-center gap-5">
                                    <div
                                        className={cn(
                                            'p-3 rounded-xl transition-colors',
                                            job.isActive
                                                ? 'bg-sky-500/10 text-sky-400'
                                                : 'bg-slate-800/40 text-slate-500',
                                        )}
                                    >
                                        <Settings className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-white tracking-tight">
                                            {job.name}
                                        </h5>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800/50">
                                                {job.scheduleCron || 'Manual Only'}
                                            </span>
                                            {job.lastRunAt && (
                                                <span className="text-[10px] text-slate-400">
                                                    Last Run:{' '}
                                                    {new Date(job.lastRunAt).toLocaleTimeString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="icon-lg"
                                    onClick={() => runJob(job.name)}
                                    disabled={runningJob === job.name}
                                    className="size-10 bg-sky-500/10 text-sky-400 hover:bg-sky-500 hover:text-white rounded-xl disabled:opacity-30"
                                    title="Run Now"
                                >
                                    {runningJob === job.name ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Play className="w-5 h-5 fill-current transition-transform hover:scale-110" />
                                    )}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2 flex items-center justify-between">
                        Recent History
                        <History className="w-3.5 h-3.5 opacity-40" />
                    </h4>
                    <div className="bg-[#0b0f15]/50 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-md">
                        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-800/40">
                            {executions.length === 0 ? (
                                <div className="p-12 text-center text-slate-600">
                                    <p className="text-xs font-medium">
                                        No system events logged yet.
                                    </p>
                                </div>
                            ) : (
                                executions.map((ex) => (
                                    <div
                                        key={ex.id}
                                        className="p-5 hover:bg-slate-800/20 transition-colors"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span
                                                className={cn(
                                                    'text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                                                    ex.status === 'success'
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : ex.status === 'failed'
                                                          ? 'bg-red-500/10 text-red-400'
                                                          : 'bg-amber-500/10 text-amber-400',
                                                )}
                                            >
                                                {ex.status}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-500">
                                                {new Date(ex.startedAt).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-300 font-medium truncate mb-1">
                                            {jobs.find((j) => j.id === ex.jobId)?.name ||
                                                'Unknown Job'}
                                        </div>
                                        <div className="flex gap-4 items-center">
                                            {ex.processedCount > 0 && (
                                                <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-medium">
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-500/50" />
                                                    {ex.processedCount} records
                                                </div>
                                            )}
                                            {ex.apiCallsCount > 0 && (
                                                <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-medium">
                                                    <Globe className="w-3 h-3 text-sky-500/50" />
                                                    {ex.apiCallsCount} API calls
                                                </div>
                                            )}
                                        </div>
                                        {ex.errorMessage && (
                                            <p className="text-[10px] text-red-400/80 leading-relaxed font-normal mt-2 bg-red-950/20 p-2 rounded-lg border border-red-500/10">
                                                {ex.errorMessage}
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkersView;
