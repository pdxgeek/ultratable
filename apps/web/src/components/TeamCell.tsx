import React from 'react';

import { cn } from '@/lib/utils';

interface TeamCellProps {
    team: {
        id: string;
        name: string;
        logo?: string;
    };
    showLogo?: boolean;
    className?: string;
}

const TeamCell: React.FC<TeamCellProps> = ({ team, showLogo = true, className }) => {
    return (
        <div className={cn('flex items-center gap-3', className)}>
            {showLogo && team.logo && (
                <img
                    src={team.logo}
                    alt={team.name}
                    className="w-6 h-6 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
                />
            )}
            <span className="font-semibold text-text-primary whitespace-nowrap">{team.name}</span>
        </div>
    );
};

export default TeamCell;
