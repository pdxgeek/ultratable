import type { RankingFormula } from '../leagues.types';

import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ListOrdered } from 'lucide-react';

interface Props {
    available: RankingFormula[];
    appliedIds: string[];
    setAppliedIds: (ids: string[]) => void;
}

const labelBase = 'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1';
const boxBase =
    'w-full h-64 bg-slate-950 border border-slate-800 rounded-lg overflow-y-auto focus:outline-none focus:border-amber-500 transition-all';
const itemBase =
    'px-3 py-2 text-sm font-mono cursor-pointer select-none transition-colors border-b border-slate-900/80 last:border-b-0';
const itemActive = 'bg-amber-500/15 text-amber-300';
const itemIdle = 'text-slate-300 hover:bg-slate-900';
const arrowBtn =
    'w-9 h-9 flex items-center justify-center rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-amber-400 disabled:opacity-30 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 transition-colors';

export const RankingPrioritySelector: React.FC<Props> = ({
    available,
    appliedIds,
    setAppliedIds,
}) => {
    const [availableSel, setAvailableSel] = useState<string | null>(null);
    const [appliedSel, setAppliedSel] = useState<string | null>(null);

    const byId = new Map(available.map((f) => [f.id, f]));
    const appliedList = appliedIds
        .map((id) => byId.get(id))
        .filter((f): f is RankingFormula => !!f);
    const availableList = available.filter((f) => !appliedIds.includes(f.id));

    const addToApplied = () => {
        if (!availableSel) return;
        setAppliedIds([...appliedIds, availableSel]);
        setAvailableSel(null);
    };

    const removeFromApplied = () => {
        if (!appliedSel) return;
        setAppliedIds(appliedIds.filter((id) => id !== appliedSel));
        setAppliedSel(null);
    };

    const moveApplied = (delta: -1 | 1) => {
        if (!appliedSel) return;
        const idx = appliedIds.indexOf(appliedSel);
        const next = idx + delta;
        if (idx < 0 || next < 0 || next >= appliedIds.length) return;
        const copy = [...appliedIds];
        [copy[idx], copy[next]] = [copy[next], copy[idx]];
        setAppliedIds(copy);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 px-2">
                <ListOrdered className="w-4 h-4 text-amber-500" />
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Ranking &amp; Priority
                </h4>
                <span className="text-[9px] text-slate-600 font-mono italic">
                    Tiebreaker order — top to bottom
                </span>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 items-stretch">
                <div>
                    <label className={labelBase}>Available</label>
                    <ul className={boxBase}>
                        {availableList.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-slate-600 italic">
                                All formulas applied.
                            </li>
                        ) : (
                            availableList.map((f) => (
                                <li
                                    key={f.id}
                                    onClick={() => setAvailableSel(f.id)}
                                    className={`${itemBase} ${availableSel === f.id ? itemActive : itemIdle}`}
                                    title={f.description ?? undefined}
                                >
                                    {f.name}
                                    <span className="ml-2 text-[10px] text-slate-600">{f.id}</span>
                                </li>
                            ))
                        )}
                    </ul>
                </div>

                <div className="flex flex-col justify-center gap-2 pt-7">
                    <button
                        type="button"
                        onClick={addToApplied}
                        disabled={!availableSel}
                        className={arrowBtn}
                        title="Add to applied"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={removeFromApplied}
                        disabled={!appliedSel}
                        className={arrowBtn}
                        title="Remove from applied"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>

                <div>
                    <label className={labelBase}>Applied (in order)</label>
                    <ul className={boxBase}>
                        {appliedList.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-slate-600 italic">
                                No criteria applied — using server fallback.
                            </li>
                        ) : (
                            appliedList.map((f, i) => (
                                <li
                                    key={f.id}
                                    onClick={() => setAppliedSel(f.id)}
                                    className={`${itemBase} ${appliedSel === f.id ? itemActive : itemIdle}`}
                                    title={f.description ?? undefined}
                                >
                                    <span className="text-[10px] text-slate-600 mr-2">
                                        {i + 1}.
                                    </span>
                                    {f.name}
                                    <span className="ml-2 text-[10px] text-slate-600">{f.id}</span>
                                </li>
                            ))
                        )}
                    </ul>
                </div>

                <div className="flex flex-col justify-center gap-2 pt-7">
                    <button
                        type="button"
                        onClick={() => moveApplied(-1)}
                        disabled={!appliedSel}
                        className={arrowBtn}
                        title="Move up"
                    >
                        <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => moveApplied(1)}
                        disabled={!appliedSel}
                        className={arrowBtn}
                        title="Move down"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};
