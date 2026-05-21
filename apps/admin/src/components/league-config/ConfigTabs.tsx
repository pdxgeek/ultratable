import type { ConfigTab } from '../leagues.types';

import React from 'react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
    configTab: ConfigTab;
    setConfigTab: (tab: ConfigTab) => void;
}

export const ConfigTabs: React.FC<Props> = ({ configTab, setConfigTab }) => (
    <Tabs
        value={configTab}
        onValueChange={(v) => setConfigTab(v as ConfigTab)}
        className="border-b border-slate-800/60 pb-4"
    >
        <TabsList
            variant="line"
            className="h-auto p-0 data-[variant=line]:gap-6 text-[10px] uppercase tracking-widest font-bold"
        >
            <TabsTrigger
                value="league"
                className="px-1 py-1 text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-slate-300 data-active:text-amber-400 after:bg-amber-400"
            >
                League Defaults
            </TabsTrigger>
            <TabsTrigger
                value="season"
                className="px-1 py-1 text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-slate-300 data-active:text-amber-400 after:bg-amber-400"
            >
                Season Overrides
            </TabsTrigger>
        </TabsList>
    </Tabs>
);
