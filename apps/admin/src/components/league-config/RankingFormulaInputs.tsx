import React from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
    promoInput: string;
    setPromoInput: (val: string) => void;
    playoffInput: string;
    setPlayoffInput: (val: string) => void;
    relInput: string;
    setRelInput: (val: string) => void;
}

const labelClass = 'text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1';
const inputClass =
    'h-10 px-4 py-2 bg-slate-950 border-slate-800 font-mono text-sm placeholder:text-slate-700 focus-visible:border-amber-500 focus-visible:ring-0';

export const RankingFormulaInputs: React.FC<Props> = ({
    promoInput,
    setPromoInput,
    playoffInput,
    setPlayoffInput,
    relInput,
    setRelInput,
}) => (
    <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
            <Label htmlFor="ranking-promo" className={labelClass}>
                Promotion Spots
            </Label>
            <Input
                id="ranking-promo"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="e.g. 1, 2"
                className={`${inputClass} text-emerald-400`}
            />
        </div>
        <div className="space-y-2">
            <Label htmlFor="ranking-playoff" className={labelClass}>
                Playoff Spots
            </Label>
            <Input
                id="ranking-playoff"
                value={playoffInput}
                onChange={(e) => setPlayoffInput(e.target.value)}
                placeholder="e.g. 3, 4, 5, 6"
                className={`${inputClass} text-sky-400`}
            />
        </div>
        <div className="space-y-2">
            <Label htmlFor="ranking-rel" className={labelClass}>
                Relegation Spots
            </Label>
            <Input
                id="ranking-rel"
                value={relInput}
                onChange={(e) => setRelInput(e.target.value)}
                placeholder="e.g. 18, 19, 20"
                className={`${inputClass} text-red-400`}
            />
        </div>
    </div>
);
