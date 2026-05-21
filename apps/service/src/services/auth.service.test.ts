import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toWebHeaders } from './auth.service';

// Mock the db module before importing resolveDomainUser
vi.mock('../db', () => ({
    db: {
        select: vi.fn(),
    }
}));

describe('auth.service', () => {
    describe('toWebHeaders', () => {
        it('converts string header values', () => {
            const headers = toWebHeaders({
                'content-type': 'application/json',
                'authorization': 'Bearer token123'
            });
            expect(headers.get('content-type')).toBe('application/json');
            expect(headers.get('authorization')).toBe('Bearer token123');
        });

        it('joins array header values', () => {
            const headers = toWebHeaders({
                'set-cookie': ['cookie1=a', 'cookie2=b']
            });
            expect(headers.get('set-cookie')).toBe('cookie1=a,cookie2=b');
        });

        it('ignores undefined values', () => {
            const headers = toWebHeaders({
                'x-present': 'yes',
                'x-missing': undefined
            });
            expect(headers.get('x-present')).toBe('yes');
            expect(headers.get('x-missing')).toBeNull();
        });

        it('handles empty headers object', () => {
            const headers = toWebHeaders({});
            expect([...headers.entries()]).toHaveLength(0);
        });
    });

    describe('resolveDomainUser', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            // Reset module cache to clear the in-memory domain user cache
            vi.resetModules();
        });

        it('returns null when no auth link exists', async () => {
            const { db } = await import('../db');
            const { resolveDomainUser } = await import('./auth.service');

            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([])
                        })
                    })
                })
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            const result = await resolveDomainUser('nonexistent-auth-id');
            expect(result).toBeNull();
        });

        it('resolves domain user from bridge table', async () => {
            const { db } = await import('../db');
            const { resolveDomainUser } = await import('./auth.service');

            const mockUser = { id: 'uuid-123', name: 'Dave', email: 'dave@test.com', roles: ['user', 'admin'] };
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([mockUser])
                        })
                    })
                })
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            const result = await resolveDomainUser('auth-user-id');
            expect(result).toEqual({
                id: 'uuid-123',
                name: 'Dave',
                email: 'dave@test.com',
                roles: ['user', 'admin']
            });
        });

        it('defaults roles to [user] when roles field is not an array', async () => {
            const { db } = await import('../db');
            const { resolveDomainUser } = await import('./auth.service');

            const mockUser = { id: 'uuid-123', name: 'Dave', email: 'dave@test.com', roles: 'not-an-array' };
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([mockUser])
                        })
                    })
                })
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            const result = await resolveDomainUser('auth-user-id');
            expect(result?.roles).toEqual(['user']);
        });

        it('returns cached user on subsequent calls', async () => {
            const { db } = await import('../db');
            const { resolveDomainUser } = await import('./auth.service');

            const mockUser = { id: 'uuid-123', name: 'Dave', email: 'dave@test.com', roles: ['user'] };
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([mockUser])
                        })
                    })
                })
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            await resolveDomainUser('cached-auth-id');
            await resolveDomainUser('cached-auth-id');

            // Should only hit DB once
            expect(db.select).toHaveBeenCalledTimes(1);
        });
    });

    describe('LRU eviction under pressure', () => {
        it('caps domain user cache at 500 entries — older entries get evicted', async () => {
            vi.resetModules();
            const { db } = await import('../db');
            const { resolveDomainUser } = await import('./auth.service');
            vi.mocked(db.select).mockReset();

            // Each call resolves a unique authUserId → unique domain user, then caches it.
            let queryIndex = 0;
            const selectMock = vi.fn().mockImplementation(() => ({
                from: () => ({
                    innerJoin: () => ({
                        where: () => {
                            const idx = queryIndex++;
                            return {
                                limit: vi.fn().mockResolvedValue([
                                    { id: `uuid-${idx}`, name: 'u', email: 'u@x', roles: ['user'] }
                                ])
                            };
                        }
                    })
                })
            }));
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            // Resolve 501 distinct users so the LRU is forced to evict the oldest.
            for (let i = 0; i < 501; i++) {
                await resolveDomainUser(`auth-${i}`);
            }
            const callsAfterFill = vi.mocked(db.select).mock.calls.length;
            expect(callsAfterFill).toBe(501);

            // The oldest entry should have been evicted — re-resolving it triggers a fresh DB hit.
            await resolveDomainUser('auth-0');
            expect(vi.mocked(db.select).mock.calls.length).toBe(callsAfterFill + 1);

            // The most recent entry is still cached — no new DB hit.
            const before = vi.mocked(db.select).mock.calls.length;
            await resolveDomainUser('auth-500');
            expect(vi.mocked(db.select).mock.calls.length).toBe(before);
        });
    });

    describe('invalidateDomainUserCache', () => {
        it('forces re-query after invalidation', async () => {
            vi.resetModules();
            const { db } = await import('../db');
            const { resolveDomainUser, invalidateDomainUserCache } = await import('./auth.service');

            const mockUser = { id: 'uuid-123', name: 'Dave', email: 'dave@test.com', roles: ['user'] };
            const selectMock = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([mockUser])
                        })
                    })
                })
            });
            vi.mocked(db.select).mockImplementation(selectMock as unknown as typeof db.select);

            await resolveDomainUser('auth-to-invalidate');
            const callsAfterFirst = vi.mocked(db.select).mock.calls.length;

            // Second call should be cached — no new DB call
            await resolveDomainUser('auth-to-invalidate');
            expect(vi.mocked(db.select).mock.calls.length).toBe(callsAfterFirst);

            // After invalidation, next call MUST hit DB again
            invalidateDomainUserCache('auth-to-invalidate');
            await resolveDomainUser('auth-to-invalidate');
            expect(vi.mocked(db.select).mock.calls.length).toBeGreaterThan(callsAfterFirst);
        });
    });
});
