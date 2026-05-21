import React from 'react';

interface TeamCellProps {
    team: {
        id: string;
        name: string;
        logo?: string;
    };
    showLogo?: boolean;
}

const TeamCell: React.FC<TeamCellProps> = ({ team, showLogo = true }) => {
    return (
        <div className="flex items-center gap-3">
            {showLogo && team.logo && (
                <img
                    src={team.logo}
                    alt={team.name}
                    className="w-6 h-6 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
                />
            )}
            <span className="font-semibold text-text-primary">{team.name}</span>
        </div>
    );
};

export default TeamCell;
