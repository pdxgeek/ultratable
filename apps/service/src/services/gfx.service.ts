import axios from 'axios';
import crypto from 'node:crypto';
import { supabase } from '../db';
import { repository } from '../repositories/supabase.repository';
import { globalLogger } from '../services/log.service';

const logger = globalLogger.child({ module: 'GfxService' });

export class GfxService {
    private static BUCKET_NAME = 'gfx';

    /**
     * Downloads an image from a URL, calculates its SHA-256 hash,
     * and uploads it to Supabase Storage if it doesn't exist.
     * Then records the mapping in the graphics table.
     */
    static async sideload(entityType: string, entityId: string, url: string, variant = 'default'): Promise<string | null> {
        if (!url || !url.startsWith('http')) return null;

        try {
            // 1. Download image
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            const contentTypeHeader = response.headers['content-type'];
            const contentType: string = typeof contentTypeHeader === 'string' ? contentTypeHeader : 'image/png';

            // 2. Calculate Hash
            const hash = crypto.createHash('sha256').update(buffer).digest('hex');
            const blobPath = `blobs/${hash}.${contentType.split('/')[1] || 'png'}`;

            // 3. Upload to Supabase Storage if not exists
            const { data: existing } = await supabase.storage
                .from(this.BUCKET_NAME)
                .list('blobs', { search: hash });

            if (!existing || existing.length === 0) {
                const { error: uploadError } = await supabase.storage
                    .from(this.BUCKET_NAME)
                    .upload(blobPath, buffer, {
                        contentType,
                        upsert: false
                    });

                if (uploadError && !uploadError.message.includes('already exists')) {
                    throw uploadError;
                }
            }

            // 4. Update Graphics mapping table via repository
            await repository.football.saveGraphic({
                entityType,
                entityId,
                variantName: variant,
                blobPath,
                mimeType: contentType,
                metadata: { sourceUrl: url, hash }
            });

            return blobPath;
        } catch (error: unknown) {
            logger.error({
                url,
                error: (error as Error).message
            }, `Failed to sideload graphic for ${entityType}:${entityId}`);
            return null;
        }
    }
}
