import fs from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PostgresConfigRepository } from './postgres/config.repository';

vi.mock('node:fs/promises');

describe('PostgresConfigRepository', () => {
    let repo: PostgresConfigRepository;

    beforeEach(() => {
        repo = new PostgresConfigRepository();
        vi.clearAllMocks();
        // Clear environment variables for consistency
        delete process.env.DATABASE_URL;
        delete process.env.API_FOOTBALL_KEY;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_ANON_KEY;
    });

    describe('masking logic', () => {
        it('should mask database URL correctly', async () => {
            process.env.DATABASE_URL =
                'postgresql://postgres:password@db.example.com:5432/postgres';
            const masked = await repo.getDatabaseUrlMasked();
            expect(masked).toBe('postgresql://****@db.example.com:5432/postgres');
        });

        it('should return null for unconfigured database URL', async () => {
            const masked = await repo.getDatabaseUrlMasked();
            expect(masked).toBeNull();
        });

        it('should mask API-Football key correctly', async () => {
            process.env.API_FOOTBALL_KEY = '1234567890abcdef1234567890abcdef';
            const masked = await repo.getApiFootballKeyMasked();
            expect(masked).toBe('1234****cdef');
        });

        it('should mask Supabase anon key correctly', async () => {
            process.env.SUPABASE_ANON_KEY = 'sb_1234567890';
            const masked = await repo.getSupabaseAnonKeyMasked();
            expect(masked).toBe('sb_1****7890');
        });
    });

    describe('updateEnvs', () => {
        it('should write new variables to .env', async () => {
            const mockContent = 'EXISTING=value';
            vi.mocked(fs.readFile).mockResolvedValue(mockContent);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await repo.updateDatabaseUrl('new_url');

            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                expect.stringContaining('DATABASE_URL=new_url'),
            );
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                expect.stringContaining('EXISTING=value'),
            );
        });

        it('should update existing variables in .env', async () => {
            const mockContent = 'DATABASE_URL=old_url\nOTHER=thing';
            vi.mocked(fs.readFile).mockResolvedValue(mockContent);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await repo.updateDatabaseUrl('new_url');

            const writeArg = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            expect(writeArg).toContain('DATABASE_URL=new_url');
            expect(writeArg).not.toContain('DATABASE_URL=old_url');
            expect(writeArg).toContain('OTHER=thing');
        });
    });
});
