import { useRef, useCallback } from 'react';
import type { Fixture, Team } from '../types';
import { gfxRegistry } from '../services/gfxRegistry';
import { usePopup } from '../context/PopupContext';
import { useSettings } from '../context/SettingsContext';
import TeamLogo from './TeamLogo';

interface NextMatchBadgeProps {
    fixture: Fixture | null;
    teamId: string;
    teams: Map<string, Team>;
    allFixtures: Fixture[];
}

export default function NextMatchBadge({
    fixture,
    teamId,
    teams,
}: NextMatchBadgeProps) {
    const { showPopup, scheduleHide, cancelHide } = usePopup();
    const { settings } = useSettings();
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!settings.showHovers) return;
            const rect = e.currentTarget.getBoundingClientRect();
            // Cancel any pending hide from leaving another element
            cancelHide();
            timeoutRef.current = setTimeout(() => {
                if (fixture) {
                    showPopup({
                        fixture,
                        teams,
                        anchorRect: rect,
                    });
                }
            }, 200);
        },
        [fixture, teams, showPopup, cancelHide, settings.showHovers]
    );

    const handleMouseLeave = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        scheduleHide();
    }, [scheduleHide]);

    if (!fixture) {
        return <div className="next-match next-match--empty">–</div>;
    }

    const isHome = fixture.homeTeamId === teamId;
    const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
    const opponent = teams.get(opponentId);
    // Use denormalized logo if available, else fall back to GFX or placeholder
    const logo = opponent?.logo || gfxRegistry.getLogo(opponentId);

    return (
        <div
            className={`next-match ${isHome ? 'next-match--home' : 'next-match--away'}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <TeamLogo
                url={logo}
                teamId={opponent?.id || opponentId}
                name={opponent?.commonName}
                className="next-match__logo"
            />
            <span className="next-match__name-text">
                vs {opponent?.commonName || 'Unknown'}
            </span>
            <span className="next-match__ha">{isHome ? 'H' : 'A'}</span>

        </div>
    );
}
