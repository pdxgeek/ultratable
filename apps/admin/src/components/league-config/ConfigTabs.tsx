import React from 'react';

import type { ConfigTab } from '../leagues.types';

interface Props {
    configTab: ConfigTab;
    setConfigTab: (tab: ConfigTab) => void;
}

export const ConfigTabs: React.FC<Props> = ({ configTab, setConfigTab }) => {
    const tabClass = (active: boolean) =>
        `px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors ${active ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'}`;
    return (
        <div className="flex border-b border-slate-800/60 pb-4">
            <button onClick={() => setConfigTab('league')} className={tabClass(configTab === 'league')}>
                League Defaults
            </button>
            <button onClick={() => setConfigTab('season')} className={tabClass(configTab === 'season')}>
                Season Overrides
            </button>
        </div>
    );
};
