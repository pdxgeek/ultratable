import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageProvider } from './storage.provider';
import * as dotenv from 'dotenv';
import path from 'path';
import { globalLogger } from '../services/log.service';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const logger = globalLogger.child({ module: 'providers/supabase-storage' });

export class SupabaseStorageProvider implements StorageProvider {
    private client: SupabaseClient;

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env for storage operations');
        }

        // Use service role key to bypass RLS for server-side uploads
        this.client = createClient(supabaseUrl, serviceRoleKey);
    }

    async upload(bucket: string, path: string, file: Buffer | ArrayBuffer | Blob, mimeType: string, upsert: boolean = false): Promise<string> {
        const { error } = await this.client.storage
            .from(bucket)
            .upload(path, file, {
                contentType: mimeType,
                upsert,
            });

        if (error) {
            logger.error({ error: error.message, bucket, path }, 'Failed to upload to Supabase storage');
            throw error;
        }

        return this.getPublicUrl(bucket, path);
    }

    getPublicUrl(bucket: string, path: string): string {
        const { data } = this.client.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    }

    async list(bucket: string, prefix?: string): Promise<string[]> {
        const { data, error } = await this.client.storage
            .from(bucket)
            .list(prefix, {
                limit: 1000,
                offset: 0,
                sortBy: { column: 'name', order: 'asc' }
            });

        if (error) {
            logger.error({ error: error.message, bucket, prefix }, 'Failed to list from Supabase storage');
            throw error;
        }

        // Return only files, ignoring directories
        return data.filter(d => d.id !== null).map(d => `${prefix ? prefix + '/' : ''}${d.name}`);
    }

    async delete(bucket: string, paths: string[]): Promise<void> {
        const { error } = await this.client.storage.from(bucket).remove(paths);
        if (error) {
            logger.error({ error: error.message, bucket, paths }, 'Failed to delete from Supabase storage');
            throw error;
        }
    }
}
