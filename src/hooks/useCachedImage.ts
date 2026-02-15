import { useState, useEffect } from 'react';
import { gfxRegistry } from '../services/gfxRegistry';

export function useCachedImage(url: string | null | undefined): string | null {
    const [cachedUrl, setCachedUrl] = useState<string | null>(url ?? null);

    useEffect(() => {
        if (!url) {
            setCachedUrl(null);
            return;
        }

        let isMounted = true;

        async function load() {
            try {
                const result = await gfxRegistry.getImage(url);
                if (isMounted && result) {
                    setCachedUrl(result);
                }
            } catch (err) {
                console.warn('Failed to load cached image', err);
                if (isMounted) setCachedUrl(url ?? null); // Fallback
            }
        }

        load();

        return () => {
            isMounted = false;
        };
    }, [url]);

    return cachedUrl;
}
