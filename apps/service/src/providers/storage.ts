import { runtimeMode } from '../config/runtime-mode';
import { MinIOStorageProvider } from './minio-storage.provider';
import { NoopStorageProvider } from './noop-storage.provider';
import { StorageProvider } from './storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';

function createStorageProvider(): StorageProvider {
    if (runtimeMode === 'supabase') return new SupabaseStorageProvider();
    if (runtimeMode === 'docker') return new MinIOStorageProvider();
    // 'system' mode: user brought their own Postgres; blob storage is opt-in
    // and not configured by the setup script. Drop uploads cleanly.
    return new NoopStorageProvider();
}

export const storageProvider: StorageProvider = createStorageProvider();
