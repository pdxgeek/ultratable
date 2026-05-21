import type { Graphic, GraphicType } from './types';

import React, { useEffect, useState } from 'react';

import { gqlFetch } from '../../lib/api';
import { GRAPHIC_TYPES } from './types';

export type UploadStatus = 'idle' | 'loading' | 'success' | 'error';

export function useGraphics(typeFilter: GraphicType | 'all') {
    const [graphics, setGraphics] = useState<Graphic[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchGraphics = React.useCallback(async () => {
        setLoading(true);
        try {
            const typesToFetch = typeFilter === 'all' ? GRAPHIC_TYPES : [typeFilter];
            let allGraphics: Graphic[] = [];
            for (const t of typesToFetch) {
                const data = await gqlFetch<{ graphics: Graphic[] }>(
                    `query GetGraphics($type: String!) { graphics(entityType: $type) { id entityType entityId url mimeType metadata sourceUrl createdAt } }`,
                    { type: t },
                );
                if (data.graphics) allGraphics = [...allGraphics, ...data.graphics];
            }
            setGraphics(allGraphics);
        } catch (e) {
            console.error('Failed to fetch graphics:', e);
        } finally {
            setLoading(false);
        }
    }, [typeFilter]);

    useEffect(() => {
        fetchGraphics();
    }, [fetchGraphics]);

    return { graphics, loading, refetch: fetchGraphics };
}

export async function registerOrAutoSideloadGraphic(
    entityType: GraphicType,
    entityId: string,
    url: string,
): Promise<boolean> {
    const isAuto = !url.trim();
    const query = isAuto
        ? `mutation AutoSideload($entityId: String!, $entityType: String!) {
            autoSideloadGraphic(entityId: $entityId, entityType: $entityType)
          }`
        : `mutation RegisterGraph($entityId: String!, $entityType: String!, $url: String!) {
            registerGraphic(entityId: $entityId, entityType: $entityType, url: $url)
          }`;
    const variables = isAuto ? { entityId, entityType } : { entityId, entityType, url };

    const data = await gqlFetch<Record<string, string | null>>(query, variables);
    return Boolean(data.registerGraphic || data.autoSideloadGraphic);
}
