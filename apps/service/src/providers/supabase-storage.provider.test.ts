/**
 * SupabaseStorageProvider unit tests — issue #51.
 *
 * The provider wraps the @supabase/supabase-js storage client. We stub the SDK
 * at the module boundary so the tests never touch real Supabase.
 *
 * Covered:
 *   - constructor throws when env vars are missing (prevents silent prod misconfigs)
 *   - upload happy path returns the public URL
 *   - upload propagates SDK errors (e.g. 401/403, bucket missing)
 *   - getPublicUrl returns the URL the SDK reports
 *   - list filters out directory entries
 *   - delete throws on SDK error
 *
 * Failure-mode coverage matches the issue's "401/403 from upstream, missing
 * bucket, oversize payload" list — they all surface here as `error` from the
 * SDK and must propagate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(),
}));

type SupabaseStorageMock = {
    upload: ReturnType<typeof vi.fn>;
    getPublicUrl: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
};

function installSupabaseMock(storage: Partial<SupabaseStorageMock> = {}): SupabaseStorageMock {
    const fns: SupabaseStorageMock = {
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
        list: vi.fn(),
        remove: vi.fn(),
        ...storage,
    };
    const fromMock = vi.fn().mockReturnValue(fns);
    const client = { storage: { from: fromMock } };
    return Object.assign(fns, {
        // @ts-expect-error — augment for assertion access
        __from: fromMock,
        __client: client,
    });
}

describe('SupabaseStorageProvider', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env = {
            ...originalEnv,
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-key',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('throws when SUPABASE_URL is missing — prevents a silently broken provider in prod', async () => {
        delete process.env.SUPABASE_URL;
        const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
        expect(() => new SupabaseStorageProvider()).toThrow(/SUPABASE_URL/);
    });

    it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
        expect(() => new SupabaseStorageProvider()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    describe('upload', () => {
        it('uploads the buffer and returns the public URL', async () => {
            const mock = installSupabaseMock();
            mock.upload.mockResolvedValue({ data: null, error: null });
            mock.getPublicUrl.mockReturnValue({
                data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/g/x.png' },
            });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            const url = await provider.upload(
                'g',
                'x.png',
                Buffer.from('bytes'),
                'image/png',
                true,
            );

            expect(url).toContain('storage/v1/object/public/g/x.png');
            expect(mock.upload).toHaveBeenCalledWith('x.png', expect.any(Buffer), {
                contentType: 'image/png',
                upsert: true,
            });
        });

        it('propagates 401/403-style SDK errors', async () => {
            const mock = installSupabaseMock();
            mock.upload.mockResolvedValue({
                data: null,
                error: { message: 'Unauthorized', statusCode: '401' },
            });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            await expect(
                provider.upload('g', 'x.png', Buffer.from('b'), 'image/png'),
            ).rejects.toMatchObject({ message: 'Unauthorized' });
        });

        it('propagates missing-bucket / not-found SDK errors', async () => {
            const mock = installSupabaseMock();
            mock.upload.mockResolvedValue({
                data: null,
                error: { message: 'Bucket not found' },
            });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            await expect(
                provider.upload('missing', 'x', Buffer.from('b'), 'image/png'),
            ).rejects.toMatchObject({ message: 'Bucket not found' });
        });

        it('defaults upsert to false when not provided', async () => {
            const mock = installSupabaseMock();
            mock.upload.mockResolvedValue({ data: null, error: null });
            mock.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://x' } });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            await provider.upload('g', 'x.png', Buffer.from('b'), 'image/png');

            expect(mock.upload).toHaveBeenCalledWith(
                'x.png',
                expect.any(Buffer),
                expect.objectContaining({ upsert: false }),
            );
        });
    });

    describe('getPublicUrl', () => {
        it('returns the URL the SDK reports', async () => {
            const mock = installSupabaseMock();
            mock.getPublicUrl.mockReturnValue({
                data: { publicUrl: 'https://test.supabase.co/g/blob' },
            });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            expect(provider.getPublicUrl('g', 'blob')).toBe('https://test.supabase.co/g/blob');
        });
    });

    describe('list', () => {
        it('returns only file entries (skips directories where id is null)', async () => {
            const mock = installSupabaseMock();
            mock.list.mockResolvedValue({
                data: [
                    { id: 'real-file-1', name: 'a.png' },
                    { id: null, name: 'subdir' },
                    { id: 'real-file-2', name: 'b.png' },
                ],
                error: null,
            });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            const out = await provider.list('g', 'blobs');
            expect(out).toEqual(['blobs/a.png', 'blobs/b.png']);
        });

        it('propagates list errors', async () => {
            const mock = installSupabaseMock();
            mock.list.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            await expect(provider.list('g')).rejects.toMatchObject({ message: 'forbidden' });
        });
    });

    describe('delete', () => {
        it('calls remove with the given paths', async () => {
            const mock = installSupabaseMock();
            mock.remove.mockResolvedValue({ data: null, error: null });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            await provider.delete('g', ['a.png', 'b.png']);
            expect(mock.remove).toHaveBeenCalledWith(['a.png', 'b.png']);
        });

        it('propagates delete errors', async () => {
            const mock = installSupabaseMock();
            mock.remove.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
            const { createClient } = await import('@supabase/supabase-js');
            // @ts-expect-error mock-only field
            vi.mocked(createClient).mockReturnValue(mock.__client);

            const { SupabaseStorageProvider } = await import('./supabase-storage.provider');
            const provider = new SupabaseStorageProvider();
            await expect(provider.delete('g', ['x'])).rejects.toMatchObject({
                message: 'forbidden',
            });
        });
    });
});
