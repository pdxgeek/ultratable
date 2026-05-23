import type { PredictionType } from './queries';

import React from 'react';

import { cn } from '@/lib/utils';

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
                        className={cn(
                            'rounded-md px-3 py-2 text-sm font-medium text-left transition-colors',
                            isActive
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                    >
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
};

export default PredictionTypeNav;
