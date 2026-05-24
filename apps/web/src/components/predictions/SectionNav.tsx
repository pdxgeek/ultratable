import React from 'react';

import { cn } from '@/lib/utils';

export interface SectionItem<Id extends string = string> {
    id: Id;
    label: string;
}

interface SectionNavProps<Id extends string> {
    items: SectionItem<Id>[];
    selected: Id;
    onSelect: (id: Id) => void;
    ariaLabel?: string;
}

function SectionNav<Id extends string>({
    items,
    selected,
    onSelect,
    ariaLabel,
}: SectionNavProps<Id>): React.ReactElement {
    return (
        <nav aria-label={ariaLabel} className="flex flex-col gap-1">
            {items.map((item) => {
                const isActive = item.id === selected;
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
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
}

export default SectionNav;
