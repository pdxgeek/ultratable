import { useState, useEffect } from 'react';
import type { Team } from '../types';
import { gfxRegistry } from '../services/gfxRegistry';
import TeamLogo from './TeamLogo';

interface TeamCellProps {
    team: Team;
    showLogo?: boolean;
}

export default function TeamCell({ team, showLogo = true }: TeamCellProps) {
    // Defensive check for legacy data or missing commonName
    const displayName = team.commonName ?? (team as any).name ?? 'Unknown Team';
    const displayLogoName = displayName === 'Unknown Team' ? '??' : displayName;

    // Prefer team.logo, fallback to registry
    const [logo, setLogo] = useState<string | undefined>(
        team.logo || gfxRegistry.getLogo(team.id)
    );

    useEffect(() => {
        if (!showLogo) return;
        if (team.logo) {
            setLogo(team.logo);
            return;
        }

        // Poll briefly to catch lazy-loaded logos if not yet available
        if (!logo) {
            const interval = setInterval(() => {
                const url = gfxRegistry.getLogo(team.id);
                if (url) {
                    setLogo(url);
                    clearInterval(interval);
                }
            }, 500);
            return () => clearInterval(interval);
        }
    }, [team.id, team.logo, logo, showLogo]);

    return (
        <div className="team-cell">
            {showLogo && (
                <TeamLogo
                    url={logo}
                    teamId={team.id}
                    name={displayLogoName}
                    className="team-cell__logo"
                />
            )}
            <span className="team-cell__name">{displayName}</span>
        </div>
    );
}
