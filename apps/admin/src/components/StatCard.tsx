import React from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
    label: string;
    value: string | number;
    subValue: string;
    isError: boolean;
    icon?: React.ElementType;
}

const StatCard = ({ label, value, subValue, isError, icon: Icon }: StatCardProps) => {
    return (
        <Card
            className={cn(
                'p-8 gap-0 rounded-2xl border ring-0 transition-all duration-300',
                isError
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-slate-800/60 shadow-sm hover:border-slate-700',
            )}
        >
            <div className="flex items-center gap-4 mb-6">
                <div
                    className={cn(
                        'p-2.5 rounded-lg',
                        isError ? 'bg-red-500/10 text-red-500' : 'bg-sky-500/10 text-sky-500',
                    )}
                >
                    {Icon && <Icon className="w-5 h-5" />}
                </div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    {label}
                </span>
            </div>
            <div>
                <p
                    className={cn(
                        'text-2xl font-semibold tracking-tight mb-2',
                        isError ? 'text-red-400' : 'text-white',
                    )}
                >
                    {value}
                </p>
                <p className="text-[11px] text-slate-500 font-normal truncate leading-relaxed">
                    {subValue}
                </p>
            </div>
        </Card>
    );
};

export default StatCard;
