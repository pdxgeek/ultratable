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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {showLogo && team.logo && (
                <img
                    src={team.logo}
                    alt={team.name}
                    style={{
                        width: '24px',
                        height: '24px',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                    }}
                />
            )}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{team.name}</span>
        </div>
    );
};

export default TeamCell;
