import { StorageProvider } from './storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';
import { NoopStorageProvider } from './noop-storage.provider';
import { runtimeMode } from '../config/runtime-mode';

function createStorageProvider(): StorageProvider {
    if (runtimeMode === 'supabase') {
        return new SupabaseStorageProvider();
    }
    return new NoopStorageProvider();
}

export const storageProvider: StorageProvider = createStorageProvider();
