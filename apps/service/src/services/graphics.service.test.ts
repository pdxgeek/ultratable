import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    }
}));

vi.mock('../providers/supabase-storage.provider', () => ({
    storageProvider: {
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
    }
}));

vi.mock('axios');

describe('GraphicsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('registerFromUrl', () => {
        it('downloads, hashes, uploads, and maps a graphic', async () => {
            const axios = (await import('axios')).default;
            const { storageProvider } = await import('../providers/supabase-storage.provider');
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            const testBuffer = Buffer.from('image-bytes');
            (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: testBuffer,
                headers: { 'content-type': 'image/png' }
            });

            (storageProvider.upload as ReturnType<typeof vi.fn>).mockResolvedValue('https://public-url.com/blobs/hash');

            const insertMock = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined)
                })
            });
            vi.mocked(db.insert).mockImplementation(insertMock as unknown as typeof db.insert);

            const result = await graphicsService.registerFromUrl('entity-uuid', 'team', 'https://example.com/logo.png');

            expect(axios.get).toHaveBeenCalledWith('https://example.com/logo.png', expect.objectContaining({ responseType: 'arraybuffer' }));
            expect(storageProvider.upload).toHaveBeenCalledWith(
                'graphics',
                expect.stringContaining('blobs/'),
                expect.any(Buffer),
                'image/png',
                true
            );
            expect(db.insert).toHaveBeenCalled();
            expect(result).toBe('https://public-url.com/blobs/hash');
        });

        it('returns null and logs error on download failure', async () => {
            const axios = (await import('axios')).default;
            const { graphicsService } = await import('./graphics.service');

            (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const result = await graphicsService.registerFromUrl('entity-uuid', 'team', 'https://bad.url/logo.png');

            expect(result).toBeNull();
            consoleSpy.mockRestore();
        });
    });

    describe('resolveUrl', () => {
        it('returns public URL when graphic mapping exists', async () => {
            const { db } = await import('../db');
            const { storageProvider } = await import('../providers/supabase-storage.provider');
            const { graphicsService } = await import('./graphics.service');

            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([{ blobPath: 'blobs/abc123' }])
                })
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);
            (storageProvider.getPublicUrl as ReturnType<typeof vi.fn>).mockReturnValue('https://pub.com/blobs/abc123');

            const result = await graphicsService.resolveUrl('entity-uuid', 'team');
            expect(result).toBe('https://pub.com/blobs/abc123');
        });

        it('returns null when no graphic mapping exists', async () => {
            const { db } = await import('../db');
            const { graphicsService } = await import('./graphics.service');

            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([])
                })
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            const result = await graphicsService.resolveUrl('nonexistent', 'team');
            expect(result).toBeNull();
        });
    });
});
