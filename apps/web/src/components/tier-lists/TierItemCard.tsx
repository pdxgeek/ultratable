import type { TierRankableItem } from './queries';

import React from 'react';

interface Props {
    item: TierRankableItem;
    showTeamName: boolean;
    showTeamLogo: boolean;
    isLocked: boolean;
    onRemove?: () => void;
    onEdit?: () => void;
    /** When true, render as a drag overlay (no remove/edit affordances). */
    isOverlay?: boolean;
}

/**
 * Universal renderer for one tier-rankable item. Roughly square thumbnail,
 * display name + (optional) team name below, team crest overlay top-left,
 * hover-only remove × in the top-right corner.
 *
 * One component handles every recipe — the renderer never branches on
 * `tierRankableType`. Recipe-specific shape lives in the projection
 * fields (`displayImageUrl`, `displayName`, `team`).
 */
const TierItemCard: React.FC<Props> = ({
    item,
    showTeamName,
    showTeamLogo,
    isLocked,
    onRemove,
    onEdit,
    isOverlay = false,
}) => {
    const interactive = !isLocked && !isOverlay;
    return (
        <div className="group relative flex flex-col items-center gap-1 w-[88px]">
            <button
                type="button"
                disabled={!interactive}
                onClick={onEdit}
                className="relative aspect-square w-full overflow-hidden rounded-md border border-glass-border bg-glass-bg disabled:cursor-default enabled:hover:ring-2 enabled:hover:ring-accent-blue transition-shadow"
                aria-label={`Edit ${item.displayName}`}
            >
                {item.displayImageUrl ? (
                    <img
                        src={item.displayImageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                    />
                ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">
                        {item.displayName.slice(0, 2).toUpperCase()}
                    </span>
                )}
            </button>
            {showTeamLogo && item.team?.logo && (
                // Outside the overflow-hidden button so three quadrants of
                // the badge can poke past the thumbnail border. Centred on
                // the top-left corner of the thumbnail (offset = badge/2)
                // so only the bottom-right quadrant overlaps the image.
                <img
                    src={item.team.logo}
                    alt=""
                    className="pointer-events-none absolute -top-5 -left-5 w-10 h-10 rounded-full bg-white ring-1 ring-black/10 object-contain shadow-md"
                    draggable={false}
                />
            )}
            {interactive && onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                    aria-label={`Remove ${item.displayName}`}
                >
                    ×
                </button>
            )}
            <div className="w-full text-center">
                <div className="text-[0.7rem] font-medium truncate leading-tight">
                    {item.displayName}
                </div>
                {showTeamName && item.team?.name && (
                    <div className="text-[0.6rem] text-text-muted truncate leading-tight">
                        {item.team.name}
                    </div>
                )}
                {item.subtitle && (
                    <div className="text-[0.6rem] text-text-muted truncate leading-tight">
                        {item.subtitle}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TierItemCard;
