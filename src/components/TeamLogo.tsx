import { useState, useEffect } from 'react';
import { gfxRegistry } from '../services/gfxRegistry';
import { useGraphic } from '../hooks/useGraphic';

interface TeamLogoProps {
    url?: string;
    teamId?: string; // Team ID for graphic lookup
    name?: string;
    className?: string; // For sizing/positioning
    size?: number; // Optional explicit size for fallback text scaling
}

export default function TeamLogo({ url, teamId, name = '??', className = '', size }: TeamLogoProps) {
    const [error, setError] = useState(false);

    // Look up graphic by team association (using pure NanoID)
    const graphicId = teamId ? gfxRegistry.findId(teamId, 'team_logo') : null;
    const blobUrl = useGraphic(graphicId);

    // If we have a blobUrl from the hook, use it. Otherwise use the provided url prop.
    const effectiveUrl = blobUrl || url;

    // We only reset error if the effective URL changes to something valid
    useEffect(() => {
        if (effectiveUrl) {
            setError(false);
        }
    }, [effectiveUrl]);

    const initials = name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    // Deterministic color based on name
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f',
        '#1abc9c', '#e67e22', '#34495e', '#d35400', '#27ae60'
    ];
    const charCode = name.charCodeAt(0) || 0;
    const bgColor = colors[charCode % colors.length];

    if (error || !effectiveUrl) {
        return (
            <div
                className={`team-logo-fallback ${className}`}
                style={{
                    backgroundColor: bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: size ? size * 0.4 : 'inherit',
                    borderRadius: '50%', // Assuming logos are generally circular
                }}
                title={name}
            >
                {initials}
            </div>
        );
    }

    return (
        <img
            src={effectiveUrl}
            alt={name}
            className={`${className}`}
            onError={() => {
                setError(true);
                if (graphicId) {
                    gfxRegistry.reportError(graphicId).catch(err => {
                        console.error('Failed to report broken graphic:', err);
                    });
                }
            }}
            loading="lazy"
        />
    );
}
