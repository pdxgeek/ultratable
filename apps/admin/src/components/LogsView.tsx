import React, { useState } from 'react';
import { AlertCircle, History, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface LogEntry {
    id: string;
    level: string;
    module: string;
    message: string;
    context?: string | null;
    createdAt: string;
}

interface LogsViewProps {
    logs: LogEntry[];
    onRefresh: () => Promise<void>;
}

const LEVELS = ['all', 'error', 'warn', 'info'] as const;
type Level = (typeof LEVELS)[number];

export const LogsView: React.FC<LogsViewProps> = ({ logs, onRefresh }) => {
    const [filter, setFilter] = useState<Level>('all');
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

    const filteredLogs = logs.filter((log) => filter === 'all' || log.level === filter);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex justify-between items-center bg-[#0d1117] border border-slate-800/60 p-10 rounded-2xl shadow-sm relative overflow-hidden isolate group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
                <div className="relative z-10">
                    <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                        <History className="w-5 h-5 text-indigo-400" />
                        System Event Explorer
                    </h3>
                    <p className="text-sm text-slate-400 mt-2 font-normal leading-relaxed max-w-lg">
                        Real-time diagnostic logs from the background workers and API services.
                        Monitor data ingestion and infrastructure health.
                    </p>
                </div>
                <div className="flex items-center gap-2 relative z-10">
                    <Tabs value={filter} onValueChange={(v) => setFilter(v as Level)}>
                        <TabsList className="bg-slate-900/50 border border-slate-800/50 h-auto p-1 rounded-xl">
                            {LEVELS.map((lvl) => (
                                <TabsTrigger
                                    key={lvl}
                                    value={lvl}
                                    className="h-7 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 data-active:bg-slate-800 data-active:text-white"
                                >
                                    {lvl}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onRefresh}
                        className="text-slate-500 hover:text-white hover:bg-slate-800"
                        title="Refresh Logs"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="bg-[#0d1117] border border-slate-800/60 rounded-2xl shadow-sm overflow-hidden flex h-[600px]">
                <div className="flex-1 overflow-y-auto border-r border-slate-800/60">
                    {filteredLogs.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                            <AlertCircle className="w-8 h-8 mb-4 opacity-20" />
                            <p className="text-sm">No logs found matching your criteria.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800/40">
                            {filteredLogs.map((log) => (
                                <button
                                    key={log.id}
                                    type="button"
                                    onClick={() => setSelectedLog(log)}
                                    className={cn(
                                        'w-full p-4 text-left cursor-pointer hover:bg-slate-800/20 transition-all font-mono text-xs flex gap-4',
                                        selectedLog?.id === log.id && 'bg-slate-800/40',
                                    )}
                                >
                                    <div className="text-slate-500 whitespace-nowrap w-32 shrink-0">
                                        {new Date(log.createdAt).toLocaleTimeString()}
                                    </div>
                                    <div className="w-20 shrink-0">
                                        <span
                                            className={cn(
                                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                                                log.level === 'error' &&
                                                    'bg-red-500/10 text-red-400 border border-red-500/20',
                                                log.level === 'warn' &&
                                                    'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                                                log.level === 'info' &&
                                                    'bg-sky-500/10 text-sky-400 border border-sky-500/20',
                                            )}
                                        >
                                            {log.level}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-slate-200 truncate">{log.message}</p>
                                        <p className="text-slate-500 text-[10px] mt-1">
                                            {log.module}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="w-96 bg-slate-900/50 p-6 overflow-y-auto hidden lg:block border-l border-slate-800/40">
                    {selectedLog ? (
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                                    Timestamp
                                </h4>
                                <p className="text-slate-300 text-sm font-mono">
                                    {new Date(selectedLog.createdAt).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                                    Level / Module
                                </h4>
                                <div className="flex gap-2 text-sm font-mono">
                                    <span
                                        className={cn(
                                            'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                                            selectedLog.level === 'error' &&
                                                'bg-red-500/10 text-red-400 border border-red-500/20',
                                            selectedLog.level === 'warn' &&
                                                'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                                            selectedLog.level === 'info' &&
                                                'bg-sky-500/10 text-sky-400 border border-sky-500/20',
                                        )}
                                    >
                                        {selectedLog.level}
                                    </span>
                                    <span className="text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                                        {selectedLog.module}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                                    Message
                                </h4>
                                <p className="text-white text-sm leading-relaxed">
                                    {selectedLog.message}
                                </p>
                            </div>
                            {selectedLog.context &&
                                (() => {
                                    let ctxObj: Record<string, unknown> | null = null;
                                    let isObj = false;
                                    try {
                                        ctxObj =
                                            typeof selectedLog.context === 'string'
                                                ? JSON.parse(selectedLog.context)
                                                : selectedLog.context;
                                        isObj =
                                            ctxObj !== null &&
                                            typeof ctxObj === 'object' &&
                                            Object.keys(ctxObj).length > 0;
                                    } catch {
                                        // Not valid JSON
                                    }

                                    if (isObj) {
                                        return (
                                            <div>
                                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex justify-between items-center">
                                                    Context Metadata
                                                </h4>
                                                <div className="bg-[#0a0d14] rounded-xl border border-slate-800/60 w-full overflow-x-auto relative mt-2 group">
                                                    <pre className="p-4 text-xs font-mono text-sky-400 shadow-inner">
                                                        {JSON.stringify(ctxObj, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        );
                                    } else if (selectedLog.context !== '[object Object]') {
                                        return (
                                            <div>
                                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex justify-between items-center">
                                                    Context String
                                                </h4>
                                                <div className="bg-[#0a0d14] rounded-xl border border-slate-800/60 w-full overflow-x-auto relative mt-2 group">
                                                    <pre className="p-4 text-xs font-mono text-sky-400 shadow-inner whitespace-pre-wrap break-all">
                                                        {String(selectedLog.context)}
                                                    </pre>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500">
                            <Loader2 className="w-8 h-8 mb-4 opacity-20" />
                            <p className="text-sm">Select a log entry to view details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
