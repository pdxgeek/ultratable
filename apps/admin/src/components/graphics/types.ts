export type GraphicType = 'team' | 'venue' | 'player' | 'league' | 'coach';

export const GRAPHIC_TYPES: GraphicType[] = ['team', 'venue', 'player', 'league', 'coach'];

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
