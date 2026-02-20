import type { Team } from '../types';
import TeamLogo from './TeamLogo';

interface TeamCellProps {
    team: Team;
    showLogo?: boolean;
}

export default function TeamCell({ team, showLogo = true }: TeamCellProps) {
    // Defensive check for legacy data or missing commonName
    const displayName = team.commonName ?? (team as any).name ?? 'Unknown Team';
    const displayLogoName = displayName === 'Unknown Team' ? '??' : displayName;

    return (
        <div className="team-cell">
            {showLogo && (
                <TeamLogo
                    url={team.logo}
                    teamId={team.id}
                    name={displayLogoName}
                    className="team-cell__logo"
                />
            )}
            <span className="team-cell__name">{displayName}</span>
        </div>
    );
}
