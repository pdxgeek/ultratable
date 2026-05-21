/**
 * GraphicsService — orchestrates downloading source images, hashing, uploading
 * to the active storage provider, and recording an entity→blob mapping.
 *
 * Coverage added for issue #51:
 *   - SSRF guard: rejects non-http(s) URLs (file://, ftp://, etc.).
 *   - Soft-fail per failure mode:
 *       * source 404 → null (no upload, no DB write)
 *       * source timeout (ECONNABORTED) → null
 *       * storage 500 → null (axios succeeded, upload threw)
 *   - sideload (fire-and-forget) — swallows errors so callers don't crash.
 *   - sideloadMissing — skips entities that already have a graphic row,
 *     fires sideload for the rest, drops candidates with no URL.
 *   - autoSideloadGraphic — derives the upstream URL from the row's sourceId,
 *     for each supported entityType, falls back to catalogLeagues for league.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => {
    const update = vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }));
    return {
        db: {
            select: vi.fn(),
            insert: vi.fn(),
            update,
        },
    };
});

vi.mock('../providers/storage', () => ({
    storageProvider: {
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
    },
}));

vi.mock('axios');

describe('GraphicsService', () => {
    beforeEach(() => {
        // resetAllMocks (not clearAllMocks) — clearAllMocks leaves prior
        // .mockResolvedValue / .mockRejectedValue implementations in place,
        // which leaks between tests. resetAllMocks wipes implementations too.
        vi.resetAllMocks();
    });

    describe('registerFromUrl', () => {
        it('downloads, hashes, uploads, and maps a graphic', async () => {
            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/storage');
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            const testBuffer = Buffer.from('image-bytes');
            (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: testBuffer,
                headers: { 'content-type': 'image/png' },
            });

            (storageProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue(
                'https://public-url.com/blobs/hash',
            );

            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                }),
            });
            vi.mocked(db.insert).mockImplementation(insertMock as unknown as typeof db.insert);

            const result = await graphicsService.registerFromUrl(
                'entity-uuid',
                'team',
                'https://example.com/logo.png',
            );

            expect(axios.get).toHaveBeenCalledWith(
                'https://example.com/logo.png',
                expect.objectContaining({ responseType: 'arraybuffer' }),
            );
            expect(storageProvider.upload).toHaveBeenCalledWith(
                'graphics',
                expect.stringContaining('blobs/'),
                expect.any(Buffer),
                'image/png',
                true,
            );
            expect(db.insert).toHaveBeenCalled();
            expect(result).toBe('https://public-url.com/blobs/hash');
        });

        it('SSRF guard — rejects file:// URLs without hitting the network', async () => {
            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/storage');
            const { graphicsService } = await import('./graphics.service');

            const result = await graphicsService.registerFromUrl(
                'entity-uuid',
                'team',
                'file:///etc/passwd',
            );

            expect(result).toBeNull();
            expect(axios.get).not.toHaveBeenCalled();
            expect(storageProvider.upload).not.toHaveBeenCalled();
        });

        it('SSRF guard — rejects ftp:// URLs', async () => {
            const axios = (await import('axios')).default;
            const { graphicsService } = await import('./graphics.service');

            const result = await graphicsService.registerFromUrl(
                'eid',
                'team',
                'ftp://internal/secret.png',
            );
            expect(result).toBeNull();
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('soft-fails on source 404 — returns null, does not throw, does not upload', async () => {
            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/storage');
            const { graphicsService } = await import('./graphics.service');

            const notFound = Object.assign(new Error('Request failed with status 404'), {
                response: { status: 404 },
            });
            (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(notFound);

            const result = await graphicsService.registerFromUrl(
                'eid',
                'team',
                'https://up/missing.png',
            );
            expect(result).toBeNull();
            expect(storageProvider.upload).not.toHaveBeenCalled();
        });

        it('soft-fails on source timeout (ECONNABORTED)', async () => {
            const axios = (await import('axios')).default;
            const { graphicsService } = await import('./graphics.service');

            const timeout = Object.assign(new Error('timeout of 5000ms exceeded'), {
                code: 'ECONNABORTED',
            });
            (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(timeout);

            const result = await graphicsService.registerFromUrl(
                'eid',
                'team',
                'https://slow/logo.png',
            );
            expect(result).toBeNull();
        });

        it('soft-fails when storage returns 500 — axios got the bytes, upload threw', async () => {
            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/storage');
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: Buffer.from('bytes'),
                headers: { 'content-type': 'image/png' },
            });
            (storageProvider.upload as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error('storage 500'),
            );

            const result = await graphicsService.registerFromUrl(
                'eid',
                'team',
                'https://up/logo.png',
            );
            expect(result).toBeNull();
            // db.insert may be called by the pino-to-db log sink in the catch
            // path (the logger.error). What must NOT happen is an insert into
            // the graphics table — that's the real assertion.
            const schemaMod = await import('../db/schema');
            const graphicsCalls = (db.insert as ReturnType<typeof vi.fn>).mock.calls.filter(
                (c) => c[0] === schemaMod.graphics,
            );
            expect(graphicsCalls).toHaveLength(0);
        });

        it('defaults to image/png when the upstream response has no content-type header', async () => {
            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/storage');
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: Buffer.from('bytes'),
                headers: {},
            });
            (storageProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue('https://x');
            vi.mocked(db.insert).mockImplementation(
                vi.fn().mockReturnValue({
                    values: vi.fn().mockReturnValue({
                        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                    }),
                }) as unknown as typeof db.insert,
            );

            await graphicsService.registerFromUrl('eid', 'team', 'https://up/logo');
            expect(storageProvider.upload).toHaveBeenCalledWith(
                'graphics',
                expect.any(String),
                expect.any(Buffer),
                'image/png',
                true,
            );
        });
    });

    describe('sideload (fire-and-forget)', () => {
        it('never throws, even if the underlying registerFromUrl rejects', async () => {
            const axios = (await import('axios')).default;
            const { graphicsService } = await import('./graphics.service');

            // Force registerFromUrl to bubble up an unexpected rejection by
            // making axios throw a non-Error so the catch returns it through.
            (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

            // Should not throw synchronously even though the underlying promise rejects.
            expect(() =>
                graphicsService.sideload('eid', 'team', 'https://up/logo.png'),
            ).not.toThrow();

            // Drain any microtasks.
            await new Promise((r) => setImmediate(r));
        });
    });

    describe('sideloadMissing', () => {
        it('drops candidates with no URL and short-circuits when nothing usable remains', async () => {
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            await graphicsService.sideloadMissing([
                { entityId: 'a', entityType: 'team', url: null },
                { entityId: 'b', entityType: 'team', url: undefined },
                { entityId: 'c', entityType: 'team', url: '' },
            ]);

            // No usable candidates → no DB lookup for existing rows.
            expect(db.select).not.toHaveBeenCalled();
        });

        it('skips entities that already have a graphic row', async () => {
            const axios = (await import('axios')).default;
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            // Two candidates; one already has a graphic mapping.
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([{ entityId: 'already', entityType: 'team' }]),
                }),
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            // Stub registerFromUrl side-effects so any fired sideload doesn't crash.
            (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('skip'));

            const spy = vi.spyOn(graphicsService, 'sideload');

            await graphicsService.sideloadMissing([
                { entityId: 'already', entityType: 'team', url: 'https://x/1.png' },
                { entityId: 'new', entityType: 'team', url: 'https://x/2.png' },
            ]);

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith('new', 'team', 'https://x/2.png');

            spy.mockRestore();
            await new Promise((r) => setImmediate(r));
        });
    });

    describe('resolveUrl', () => {
        it('returns public URL when graphic mapping exists', async () => {
            const { db } = await import('../db');
            const { storageProvider } = await import('../providers/storage');
            const { graphicsService } = await import('./graphics.service');

            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([{ blobPath: 'blobs/abc123' }]),
                }),
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);
            (storageProvider.getPublicUrl as ReturnType<typeof vi.fn>).mockReturnValue(
                'https://pub.com/blobs/abc123',
            );

            const result = await graphicsService.resolveUrl('entity-uuid', 'team');
            expect(result).toBe('https://pub.com/blobs/abc123');
        });

        it('returns null when no graphic mapping exists', async () => {
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([]),
                }),
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            const result = await graphicsService.resolveUrl('nonexistent', 'team');
            expect(result).toBeNull();
        });
    });

    describe('autoSideloadGraphic', () => {
        async function setupRowSelect(
            row: { sourceId?: number | null } | undefined,
            extraRow?: { sourceId?: number | null },
        ): Promise<void> {
            const { db } = await import('../db');
            const where = vi.fn().mockResolvedValue(row ? [row] : []);
            const where2 = vi.fn().mockResolvedValue(extraRow ? [extraRow] : []);
            const fromCalls: ReturnType<typeof vi.fn>[] = [
                vi.fn().mockReturnValue({ where }),
                vi.fn().mockReturnValue({ where: where2 }),
            ];
            const selectMock = vi.fn();
            let i = 0;
            selectMock.mockImplementation(() => ({ from: fromCalls[i++] || fromCalls[0] }));
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);
        }

        it('derives the player URL from sourceId and calls registerFromUrl', async () => {
            await setupRowSelect({ sourceId: 12345 });

            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/storage');
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: Buffer.from('img'),
                headers: { 'content-type': 'image/png' },
            });
            (storageProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue('https://x');
            vi.mocked(db.insert).mockImplementation(
                vi.fn().mockReturnValue({
                    values: vi.fn().mockReturnValue({
                        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                    }),
                }) as unknown as typeof db.insert,
            );

            const result = await graphicsService.autoSideloadGraphic('player-uuid', 'player');
            expect(axios.get).toHaveBeenCalledWith(
                'https://media.api-sports.io/football/players/12345.png',
                expect.any(Object),
            );
            expect(result).toBe('https://x');
        });

        it('returns null when no row is found for the entity', async () => {
            await setupRowSelect(undefined);

            const axios = (await import('axios')).default;
            const { graphicsService } = await import('./graphics.service');

            const result = await graphicsService.autoSideloadGraphic('orphan', 'team');
            expect(result).toBeNull();
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('falls back to catalog_leagues when no row in leagues for an entity', async () => {
            // First select on `leagues` returns nothing, second select on `catalogLeagues` returns the row.
            await setupRowSelect(undefined, { sourceId: 39 });

            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/storage');
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: Buffer.from('img'),
                headers: { 'content-type': 'image/png' },
            });
            (storageProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue('https://x');
            vi.mocked(db.insert).mockImplementation(
                vi.fn().mockReturnValue({
                    values: vi.fn().mockReturnValue({
                        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                    }),
                }) as unknown as typeof db.insert,
            );

            const result = await graphicsService.autoSideloadGraphic('league-uuid', 'league');
            expect(axios.get).toHaveBeenCalledWith(
                'https://media.api-sports.io/football/leagues/39.png',
                expect.any(Object),
            );
            expect(result).toBe('https://x');
        });
    });
});
