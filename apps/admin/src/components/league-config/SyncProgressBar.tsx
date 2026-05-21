import type { Execution } from '../WorkersView';

import React from 'react';

interface Props {
    activeExecution: Execution | null;
}

export const SyncProgressBar: React.FC<Props> = ({ activeExecution }) => {
    if (!activeExecution || (activeExecution.totalCount || 0) <= 0) return null;
    const total = activeExecution.totalCount || 1;
    const percent = Math.round((activeExecution.processedCount / total) * 100);
    return (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                <span>Synchronizing Fixtures...</span>
                <span className="font-mono">
                    {activeExecution.processedCount} / {activeExecution.totalCount} ({percent}%)
                </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
                <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};
