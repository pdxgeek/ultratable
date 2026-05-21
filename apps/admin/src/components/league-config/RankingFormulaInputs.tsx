import React from 'react';

interface Props {
    promoInput: string;
    setPromoInput: (val: string) => void;
    playoffInput: string;
    setPlayoffInput: (val: string) => void;
    relInput: string;
    setRelInput: (val: string) => void;
}

const inputBase =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm font-mono focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700';
const labelBase = 'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1';

export const RankingFormulaInputs: React.FC<Props> = ({
    promoInput,
    setPromoInput,
    playoffInput,
    setPlayoffInput,
    relInput,
    setRelInput,
}) => (
    <div className="grid grid-cols-3 gap-4">
        <div>
            <label className={labelBase}>Promotion Spots</label>
            <input
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="e.g. 1, 2"
                className={`${inputBase} text-emerald-400`}
            />
        </div>
        <div>
            <label className={labelBase}>Playoff Spots</label>
            <input
                type="text"
                value={playoffInput}
                onChange={(e) => setPlayoffInput(e.target.value)}
                placeholder="e.g. 3, 4, 5, 6"
                className={`${inputBase} text-sky-400`}
            />
        </div>
        <div>
            <label className={labelBase}>Relegation Spots</label>
            <input
                type="text"
                value={relInput}
                onChange={(e) => setRelInput(e.target.value)}
                placeholder="e.g. 18, 19, 20"
                className={`${inputBase} text-red-400`}
            />
        </div>
    </div>
);
