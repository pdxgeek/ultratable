export type GraphicType = 'team' | 'venue' | 'player' | 'league' | 'coach';

export const GRAPHIC_TYPES: GraphicType[] = ['team', 'venue', 'player', 'league', 'coach'];

/**
 * Explicit display labels for each graphic type. The naive `${t}s`
 * pluralisation makes "coachs", which is wrong. A label map keeps the
 * internal identifier (`coach`) consistent with the server-side
 * `entityType` while letting the UI render correct English.
 */
export const GRAPHIC_TYPE_LABELS: Record<GraphicType, { singular: string; plural: string }> = {
    team: { singular: 'Team', plural: 'Teams' },
    venue: { singular: 'Venue', plural: 'Venues' },
    player: { singular: 'Player', plural: 'Players' },
    league: { singular: 'League', plural: 'Leagues' },
    coach: { singular: 'Coach', plural: 'Coaches' },
};

export interface Graphic {
    id: string;
    entityType: string;
    entityId: string;
    url: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
    sourceUrl?: string | null;
    createdAt?: string;
}
