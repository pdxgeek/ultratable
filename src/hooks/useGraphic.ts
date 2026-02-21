import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/dao/schema';
import { useEffect, useState } from 'react';

/**
 * Hook to retrieve a cached blob URL for a given Graphic ID.
 * @param graphicId The internal ID of the graphic (e.g. 'gfx_abc123')
 */
export function useGraphic(graphicId: string | null | undefined): string | null {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    const blob = useLiveQuery(
        async () => {
            if (!graphicId) return null;
            const graphic = await db.graphics.get(graphicId);
            if (!graphic || !graphic.variants) return null;

            const idx = graphic.activeVariantIndex ?? (graphic.variants.length - 1);
            const variant = graphic.variants[idx];
            if (!variant || !variant.blobHash) return null;

            const blobRecord = await db.blobs.get(variant.blobHash);
            return blobRecord?.blob || null;
        },
        [graphicId]
    );

    useEffect(() => {
        if (!blob) {
            setBlobUrl(null);
            return;
        }

        const url = URL.createObjectURL(blob);
        setBlobUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [blob]);

    return blobUrl;
}
