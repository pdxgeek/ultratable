import type { Execution } from '../WorkersView';

import React from 'react';

import { Progress } from '@/components/ui/progress';

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
            <Progress
                value={percent}
                className="h-1.5 bg-slate-800 border border-slate-700/30 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-indigo-500 [&_[data-slot=progress-indicator]]:to-sky-500"
            />
        </div>
    );
};
