import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GfxService } from './gfx.service';
import { supabase } from '../db';
import { repository } from '../repositories/supabase.repository';
import axios from 'axios';

vi.mock('axios');
vi.mock('../db', () => ({
    supabase: {
        storage: {
            from: vi.fn(() => ({
                list: vi.fn(),
                upload: vi.fn()
            }))
        }
    }
}));
vi.mock('../repositories/supabase.repository', () => ({
    repository: {
        football: {
            saveGraphic: vi.fn()
        }
    }
}));

describe('GfxService - CAS Sideloading', () => {
    const testUrl = 'https://example.com/logo.png';
    const testBuffer = Buffer.from('fake-image-data');
    const testHash = '28d81db19370f98fdc1d3e43fb1ef83a7cee62f3be86fed923d5f734da41319c';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should download, hash, and upload a new image', async () => {
        (axios.get as import('vitest').Mock).mockResolvedValue({
            data: testBuffer,
            headers: { 'content-type': 'image/png' }
        });

        const listMock = vi.fn().mockResolvedValue({ data: [], error: null });
        const uploadMock = vi.fn().mockResolvedValue({ data: {}, error: null });

        (supabase.storage.from as import('vitest').Mock).mockReturnValue({
            list: listMock,
            upload: uploadMock
        });

        const result = await GfxService.sideload('team', 'team-123', testUrl);

        expect(result).toContain(testHash);
        expect(uploadMock).toHaveBeenCalled();
        expect(repository.football.saveGraphic).toHaveBeenCalledWith(expect.objectContaining({
            entityId: 'team-123',
            blobPath: expect.stringContaining(testHash)
        }));
    });

    it('should NOT upload if image already exists in storage', async () => {
        (axios.get as import('vitest').Mock).mockResolvedValue({
            data: testBuffer,
            headers: { 'content-type': 'image/png' }
        });

        const listMock = vi.fn().mockResolvedValue({ data: [{ name: testHash }], error: null });
        const uploadMock = vi.fn();

        (supabase.storage.from as import('vitest').Mock).mockReturnValue({
            list: listMock,
            upload: uploadMock
        });

        await GfxService.sideload('team', 'team-123', testUrl);

        expect(uploadMock).not.toHaveBeenCalled();
        expect(repository.football.saveGraphic).toHaveBeenCalled();
    });
});
