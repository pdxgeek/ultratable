/**
 * Account mutation tests.
 *
 * Pins the security contract from issue #94:
 *   - Self-mutations (`updateMyProfile`, `setMyLeagueFollows`) require auth and
 *     can never operate on another user — they always derive the target from
 *     `ctx.user.id`.
 *   - `deleteUserAccount(userId)` is callable by self OR admin; anyone else
 *     gets Forbidden; guests get Unauthenticated.
 *   - The wipe goes through the single `repository.users.deleteDomainUser`
 *     entry point so future user-owned tables only need to wire `onDelete:
 *     cascade` to be covered.
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { builder } from './builder';

import './viewer';
import './account';

vi.mock('../db', () => ({
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

type Ctx = { user?: { id: string; roles: string[] }; loaders: ReturnType<typeof createLoaders> };
type YogaInstance = ReturnType<typeof createYoga<Ctx>>;

function createTestYoga(user?: Ctx['user']): YogaInstance {
    return createYoga({
        schema: builder.toSchema(),
        maskedErrors: false,
        context: () => ({ user, loaders: createLoaders() }),
    });
}

async function gql(
    yoga: YogaInstance,
    query: string,
    variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }> {
    const res = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    return res.json() as Promise<{
        data?: Record<string, unknown>;
        errors?: Array<{ message: string }>;
    }>;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Mutation.updateMyProfile', () => {
    const QUERY = `
        mutation($name: String, $image: String) {
            updateMyProfile(name: $name, image: $image) { id name image }
        }
    `;

    it('rejects guests with Unauthenticated', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { name: 'New Name' });
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
        expect(repository.users.updateDomainUserProfile).not.toHaveBeenCalled();
    });

    it('passes the viewer id from ctx (never a client-supplied id)', async () => {
        vi.mocked(repository.users.updateDomainUserProfile).mockResolvedValue({
            id: 'domain-1',
            name: 'New Name',
            email: 'a@b.c',
            image: null,
            emailVerified: true,
            roles: ['user'],
            createdAt: new Date(),
        });
        const yoga = createTestYoga({ id: 'domain-1', roles: ['user'] });
        const result = await gql(yoga, QUERY, { name: 'New Name' });
        expect(result.errors).toBeUndefined();
        expect(repository.users.updateDomainUserProfile).toHaveBeenCalledWith('domain-1', {
            name: 'New Name',
            image: undefined,
        });
    });

    it('rejects blank display names', async () => {
        const yoga = createTestYoga({ id: 'domain-1', roles: ['user'] });
        const result = await gql(yoga, QUERY, { name: '   ' });
        expect(result.errors?.[0].message).toMatch(/blank/i);
        expect(repository.users.updateDomainUserProfile).not.toHaveBeenCalled();
    });
});

describe('Mutation.setMyLeagueFollows', () => {
    const QUERY = `
        mutation($leagueIds: [ID!]!) {
            setMyLeagueFollows(leagueIds: $leagueIds)
        }
    `;

    it('rejects guests with Unauthenticated', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { leagueIds: ['l1'] });
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
        expect(repository.users.setFollowedLeagueIds).not.toHaveBeenCalled();
    });

    it('always writes to the viewer ctx id — no surface to target another user', async () => {
        vi.mocked(repository.users.setFollowedLeagueIds).mockResolvedValue(['l1', 'l2']);
        const yoga = createTestYoga({ id: 'domain-1', roles: ['user'] });
        const result = await gql(yoga, QUERY, { leagueIds: ['l1', 'l2'] });
        expect(result.errors).toBeUndefined();
        expect(result.data?.setMyLeagueFollows).toEqual(['l1', 'l2']);
        expect(repository.users.setFollowedLeagueIds).toHaveBeenCalledWith('domain-1', [
            'l1',
            'l2',
        ]);
    });
});

describe('Mutation.deleteUserAccount', () => {
    const QUERY = `mutation($userId: ID!) { deleteUserAccount(userId: $userId) }`;

    it('rejects guests with Unauthenticated', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, QUERY, { userId: 'domain-1' });
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
        expect(repository.users.deleteDomainUser).not.toHaveBeenCalled();
    });

    it('rejects a non-admin trying to delete another user with Forbidden', async () => {
        const yoga = createTestYoga({ id: 'domain-attacker', roles: ['user'] });
        const result = await gql(yoga, QUERY, { userId: 'domain-victim' });
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
        expect(repository.users.deleteDomainUser).not.toHaveBeenCalled();
    });

    it('lets the owner delete themselves', async () => {
        vi.mocked(repository.users.deleteDomainUser).mockResolvedValue({
            deletedDomainUserId: 'domain-self',
            deletedAuthUserIds: ['auth-1'],
        });
        const yoga = createTestYoga({ id: 'domain-self', roles: ['user'] });
        const result = await gql(yoga, QUERY, { userId: 'domain-self' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deleteUserAccount).toBe('domain-self');
        expect(repository.users.deleteDomainUser).toHaveBeenCalledWith('domain-self');
    });

    it('lets an admin delete any user', async () => {
        vi.mocked(repository.users.deleteDomainUser).mockResolvedValue({
            deletedDomainUserId: 'domain-victim',
            deletedAuthUserIds: ['auth-9'],
        });
        const yoga = createTestYoga({ id: 'domain-admin', roles: ['admin'] });
        const result = await gql(yoga, QUERY, { userId: 'domain-victim' });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deleteUserAccount).toBe('domain-victim');
        expect(repository.users.deleteDomainUser).toHaveBeenCalledWith('domain-victim');
    });
});
