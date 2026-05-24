/**
 * Bootstrap hook tests (issue #66).
 *
 * The Better Auth `user.create.after` hook delegates to this function. It runs
 * once per new auth identity (credential, google, …) and is required to:
 *
 *   1. Insert a fresh domain user row mirroring the auth_user's profile.
 *   2. Insert an auth_link row binding the two.
 *   3. Never auto-link by email — collisions on the domain users.email unique
 *      index must be swallowed (the auth_user stays unlinked) so that one
 *      email can fail to bootstrap without orphaning the Better Auth signup.
 *
 * Second sign-in by the same identity does not trigger the hook again (Better
 * Auth's auth_users.email is unique), so we only need to assert single-shot
 * correctness here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema';
import { bootstrapDomainUserFromAuthUser } from './auth-bootstrap';

const returningMock = vi.fn();
const usersValuesMock = vi.fn(() => ({ returning: returningMock }));
const authLinksValuesMock = vi.fn();

vi.mock('../db', () => ({
    db: {
        insert: vi.fn((table: unknown) => {
            if (table === schema.users) return { values: usersValuesMock };
            if (table === schema.authLinks)
                return {
                    values: authLinksValuesMock,
                };
            throw new Error('Unexpected table in db.insert mock');
        }),
    },
}));

describe('bootstrapDomainUserFromAuthUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('inserts a domain user and auth_link binding for the new identity', async () => {
        returningMock.mockResolvedValueOnce([{ id: 'domain-uuid-1' }]);
        authLinksValuesMock.mockResolvedValueOnce(undefined);

        await bootstrapDomainUserFromAuthUser({
            id: 'auth-1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            emailVerified: true,
            image: 'https://example.com/ada.png',
        });

        expect(usersValuesMock).toHaveBeenCalledWith({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            emailVerified: true,
            image: 'https://example.com/ada.png',
            roles: ['user', 'predictions', 'tier-lists'],
        });
        expect(authLinksValuesMock).toHaveBeenCalledWith({
            authUserId: 'auth-1',
            domainUserId: 'domain-uuid-1',
        });
    });

    it("seeds new users with the 'predictions' and 'tier-lists' roles alongside 'user'", async () => {
        returningMock.mockResolvedValueOnce([{ id: 'domain-uuid-roles' }]);
        authLinksValuesMock.mockResolvedValueOnce(undefined);

        await bootstrapDomainUserFromAuthUser({
            id: 'auth-roles',
            name: 'Roles Default',
            email: 'roles@example.com',
            emailVerified: true,
        });

        expect(usersValuesMock).toHaveBeenCalledWith(
            expect.objectContaining({ roles: ['user', 'predictions', 'tier-lists'] }),
        );
    });

    it('coerces a missing avatar to null on the inserted row', async () => {
        returningMock.mockResolvedValueOnce([{ id: 'domain-uuid-2' }]);
        authLinksValuesMock.mockResolvedValueOnce(undefined);

        await bootstrapDomainUserFromAuthUser({
            id: 'auth-2',
            name: 'No Avatar',
            email: 'noavatar@example.com',
            emailVerified: false,
        });

        expect(usersValuesMock).toHaveBeenCalledWith(
            expect.objectContaining({ image: null, emailVerified: false }),
        );
    });

    it('swallows a duplicate-email failure without throwing (no auto-link)', async () => {
        returningMock.mockRejectedValueOnce(
            Object.assign(new Error('duplicate key value violates unique constraint'), {
                code: '23505',
            }),
        );

        await expect(
            bootstrapDomainUserFromAuthUser({
                id: 'auth-3',
                name: 'Colliding Email',
                email: 'colliding@example.com',
                emailVerified: true,
            }),
        ).resolves.toBeUndefined();

        // No auth_link should be created when the domain user insert failed.
        expect(authLinksValuesMock).not.toHaveBeenCalled();
    });
});
