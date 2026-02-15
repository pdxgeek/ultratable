import { useState, useEffect } from 'react';
import { gfxRegistry } from '../services/gfxRegistry';

/**
 * Hook to retrieve a cached blob URL for a given Graphic ID.
 * @param graphicId The internal ID of the graphic (e.g. 'gfx_abc123')
 */
export function useGraphic(graphicId: string | null | undefined): string | null {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!graphicId) {
            setBlobUrl(null);
            return;
        }

        // 1. Try synchronous get (if already loaded)
        const cached = gfxRegistry.getById(graphicId);
        if (cached) {
            setBlobUrl(cached);
            return;
        }

        // 2. Load async
        let isMounted = true;
        async function load() {
            try {
                // If we have an ID, try to load it via the registry
                // The registry's loadById will check cache again and then load if needed
                if (!graphicId) return;

                const result = await gfxRegistry.loadById(graphicId);
                if (isMounted) {
                    setBlobUrl(result ?? null);
                }
            } catch (err) {
                console.warn(`Failed to load graphic ${graphicId}`, err);
                if (isMounted) setBlobUrl(null);
            }
        }

        load();

        return () => {
            isMounted = false;
        };

    }, [graphicId]);

    return blobUrl;
}
