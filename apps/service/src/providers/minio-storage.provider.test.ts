/**
 * MinIOStorageProvider unit tests — issue #51.
 *
 * Stubs the `minio` SDK Client. The provider has a few wrinkles worth pinning:
 *   - ensureBucket() runs once (memoized via this.bucketReady) — must NOT call
 *     makeBucket on the second upload.
 *   - upload with upsert=false must reject when the object already exists, the
 *     same way Supabase does.
 *   - statObject throws { code: 'NotFound' } when the object is absent; that
 *     specific shape means "go ahead", anything else propagates.
 *   - S3_PUBLIC_URL overrides the host used in getPublicUrl (docker→localhost
 *     in dev).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('minio', () => ({
    Client: vi.fn(),
}));

// The provider transitively imports log.service → db → dotenv.config(), which
// re-populates process.env from .env at module load. Stubbing ../db breaks
// that chain so our test's `delete process.env.S3_BUCKET` actually sticks.
vi.mock('../db', () => ({ db: {}, supabase: {} }));

type MinioMock = {
    bucketExists: ReturnType<typeof vi.fn>;
    makeBucket: ReturnType<typeof vi.fn>;
    setBucketPolicy: ReturnType<typeof vi.fn>;
    statObject: ReturnType<typeof vi.fn>;
    putObject: ReturnType<typeof vi.fn>;
    listObjectsV2: ReturnType<typeof vi.fn>;
    removeObjects: ReturnType<typeof vi.fn>;
};

function installMinioMock(overrides: Partial<MinioMock> = {}): MinioMock {
    const mock: MinioMock = {
        bucketExists: vi.fn().mockResolvedValue(true),
        makeBucket: vi.fn().mockResolvedValue(undefined),
        setBucketPolicy: vi.fn().mockResolvedValue(undefined),
        statObject: vi.fn(),
        putObject: vi.fn().mockResolvedValue(undefined),
        listObjectsV2: vi.fn(),
        removeObjects: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    return mock;
}

describe('MinIOStorageProvider', () => {
    const ENV_KEYS = [
        'S3_ENDPOINT',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
        'S3_BUCKET',
        'S3_PUBLIC_URL',
        'S3_REGION',
    ] as const;
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
        // process.env is a special host object — we must mutate keys
        // individually, not reassign the whole object.
        process.env.S3_ENDPOINT = 'http://localhost:9000';
        process.env.S3_ACCESS_KEY = 'access';
        process.env.S3_SECRET_KEY = 'secret';
        process.env.S3_BUCKET = 'graphics';
        delete process.env.S3_PUBLIC_URL;
        delete process.env.S3_REGION;
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (savedEnv[k] === undefined) delete process.env[k];
            else process.env[k] = savedEnv[k];
        }
    });

    it('throws if S3_ENDPOINT / ACCESS_KEY / SECRET_KEY / BUCKET are missing', async () => {
        delete process.env.S3_BUCKET;
        const { MinIOStorageProvider } = await import('./minio-storage.provider');
        expect(() => new MinIOStorageProvider()).toThrow(/S3_/);
    });

    describe('upload', () => {
        it('creates the bucket if it does not exist, then puts the object (upsert true)', async () => {
            const mock = installMinioMock({ bucketExists: vi.fn().mockResolvedValue(false) });
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            const url = await provider.upload(
                'graphics',
                'blobs/x',
                Buffer.from('bytes'),
                'image/png',
                true,
            );

            expect(mock.bucketExists).toHaveBeenCalledWith('graphics');
            expect(mock.makeBucket).toHaveBeenCalledWith('graphics');
            expect(mock.setBucketPolicy).toHaveBeenCalled();
            expect(mock.putObject).toHaveBeenCalledWith(
                'graphics',
                'blobs/x',
                expect.any(Buffer),
                expect.any(Number),
                expect.objectContaining({ 'Content-Type': 'image/png' }),
            );
            expect(url).toBe('http://localhost:9000/graphics/blobs/x');
        });

        it('memoizes bucket setup — second upload does not re-create the bucket', async () => {
            const mock = installMinioMock();
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            await provider.upload('graphics', 'a', Buffer.from('a'), 'image/png', true);
            await provider.upload('graphics', 'b', Buffer.from('b'), 'image/png', true);

            expect(mock.bucketExists).toHaveBeenCalledTimes(1);
            expect(mock.setBucketPolicy).toHaveBeenCalledTimes(1);
            expect(mock.putObject).toHaveBeenCalledTimes(2);
        });

        it('with upsert=false, rejects when statObject reports the object already exists', async () => {
            const mock = installMinioMock({ statObject: vi.fn().mockResolvedValue({}) });
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            await expect(
                provider.upload('graphics', 'dup', Buffer.from('x'), 'image/png', false),
            ).rejects.toThrow(/already exists/);
            expect(mock.putObject).not.toHaveBeenCalled();
        });

        it('with upsert=false, proceeds when statObject reports NotFound', async () => {
            const notFound = Object.assign(new Error('not found'), { code: 'NotFound' });
            const mock = installMinioMock({ statObject: vi.fn().mockRejectedValue(notFound) });
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            await provider.upload('graphics', 'new', Buffer.from('x'), 'image/png', false);
            expect(mock.putObject).toHaveBeenCalledTimes(1);
        });

        it('with upsert=false, propagates non-NotFound stat errors', async () => {
            const mock = installMinioMock({
                statObject: vi
                    .fn()
                    .mockRejectedValue(Object.assign(new Error('boom'), { code: 'AccessDenied' })),
            });
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            await expect(
                provider.upload('graphics', 'x', Buffer.from('x'), 'image/png', false),
            ).rejects.toThrow(/boom/);
        });

        it('converts ArrayBuffer input to Buffer before putObject', async () => {
            const mock = installMinioMock();
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            const ab = new Uint8Array([1, 2, 3, 4]).buffer;
            await provider.upload('graphics', 'ab', ab, 'image/png', true);
            const [, , buf, len] = mock.putObject.mock.calls[0];
            expect(Buffer.isBuffer(buf)).toBe(true);
            expect(len).toBe(4);
        });
    });

    describe('getPublicUrl', () => {
        it('uses S3_PUBLIC_URL when present (docker→host translation)', async () => {
            process.env.S3_PUBLIC_URL = 'http://localhost:9090';
            const mock = installMinioMock();
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            expect(provider.getPublicUrl('graphics', 'blobs/x')).toBe(
                'http://localhost:9090/graphics/blobs/x',
            );
        });

        it('falls back to S3_ENDPOINT when S3_PUBLIC_URL is not set', async () => {
            const mock = installMinioMock();
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            expect(provider.getPublicUrl('graphics', 'blobs/x')).toBe(
                'http://localhost:9000/graphics/blobs/x',
            );
        });
    });

    describe('list', () => {
        it('iterates listObjectsV2 and returns named objects', async () => {
            const mock = installMinioMock();
            mock.listObjectsV2.mockReturnValue(
                (async function* () {
                    yield { name: 'blobs/a' };
                    yield { name: 'blobs/b' };
                    yield {}; // nameless entries are dropped
                })(),
            );
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            const out = await provider.list('graphics', 'blobs/');
            expect(out).toEqual(['blobs/a', 'blobs/b']);
        });
    });

    describe('delete', () => {
        it('skips removeObjects when paths is empty', async () => {
            const mock = installMinioMock();
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            await provider.delete('graphics', []);
            expect(mock.removeObjects).not.toHaveBeenCalled();
        });

        it('passes the path list to removeObjects', async () => {
            const mock = installMinioMock();
            const { Client } = await import('minio');
            vi.mocked(Client).mockImplementation(function (this: unknown) {
                Object.assign(this as object, mock);
                return mock as never;
            } as never);

            const { MinIOStorageProvider } = await import('./minio-storage.provider');
            const provider = new MinIOStorageProvider();
            await provider.delete('graphics', ['blobs/a', 'blobs/b']);
            expect(mock.removeObjects).toHaveBeenCalledWith('graphics', ['blobs/a', 'blobs/b']);
        });
    });
});
