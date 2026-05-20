export type GraphicType = 'team' | 'venue' | 'player' | 'league';

export const GRAPHIC_TYPES: GraphicType[] = ['team', 'venue', 'player', 'league'];

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
