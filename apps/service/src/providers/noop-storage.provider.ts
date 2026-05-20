import { StorageProvider } from './storage.provider';

// Used in `docker` / `system` runtime modes where no object store is wired up.
// Returns empty URLs and silently drops uploads so the import paths that call
// `graphicsService.sideload(...)` can run unchanged — they tolerate a null result.
export class NoopStorageProvider implements StorageProvider {
    async upload(): Promise<string> {
        return '';
    }

    getPublicUrl(): string {
        return '';
    }

    async list(): Promise<string[]> {
        return [];
    }

    async delete(): Promise<void> {
        // no-op
    }
}
