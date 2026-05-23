import type { PredictionType } from './queries';

import React from 'react';

interface PredictionTypeItem {
    type: PredictionType;
    label: string;
}

const ITEMS: PredictionTypeItem[] = [{ type: 'PROJECTED_FINISH', label: 'Projected Finish' }];

interface PredictionTypeNavProps {
    selected: PredictionType;
    onSelect: (type: PredictionType) => void;
}

const PredictionTypeNav: React.FC<PredictionTypeNavProps> = ({ selected, onSelect }) => {
    return (
        <nav aria-label="Prediction types" className="flex flex-col gap-1">
            {ITEMS.map((item) => {
                const isActive = item.type === selected;
                return (
                    <button
                        key={item.type}
                        type="button"
                        onClick={() => onSelect(item.type)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`text-left px-3 py-2 rounded-md text-[0.9rem] font-semibold transition-colors ${
                            isActive
                                ? 'bg-accent-purple text-white'
                                : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'
                        }`}
                    >
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
};

export default PredictionTypeNav;
