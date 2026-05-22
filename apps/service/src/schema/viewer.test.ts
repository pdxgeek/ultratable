/**
 * Viewer resolver tests.
 *
 * Pins the contract from issue #66:
 *   - `viewer` returns null (no error) when unauthenticated.
 *   - `viewer` returns the joined domain user + identities when authenticated.
 *   - Identities expose provider + linkedAt for every auth_user bound to the
 *     domain account.
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { builder } from './builder';

import './viewer';

vi.mock('../db', () => ({
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

// The viewer module registers a Query but no Mutation. The global builder
// declares an empty Mutation root which GraphQL refuses to validate unless at
// least one field is present, so we register a single no-op here to keep the
// test schema self-contained instead of pulling in unrelated modules.
builder.mutationField('viewerTestNoop', (t) =>
    t.boolean({
        description: 'Test-only no-op so the empty Mutation type validates.',
        resolve: () => true,
    }),
);

type Ctx = { user?: { id: string; roles: string[] }; loaders: ReturnType<typeof createLoaders> };
type YogaInstance = ReturnType<typeof createYoga<Ctx>>;

function createTestYoga(user?: Ctx['user']): YogaInstance {
    return createYoga({
        schema: builder.toSchema(),
        maskedErrors: false,
        context: () => ({ user, loaders: createLoaders() }),
    });
}

async function gql(yoga: YogaInstance, query: string) {
    const res = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    return res.json() as Promise<{
        data?: { viewer: unknown };
        errors?: Array<{ message: string }>;
    }>;
}

describe('Query.viewer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null (not an error) when unauthenticated', async () => {
        const yoga = createTestYoga(undefined);
        const result = await gql(yoga, '{ viewer { id } }');
        expect(result.errors).toBeUndefined();
        expect(result.data?.viewer).toBeNull();
        // Resolver should short-circuit before hitting the repo.
        expect(repository.users.getDomainUserById).not.toHaveBeenCalled();
    });

    it('returns the joined domain user shape when authenticated', async () => {
        const createdAt = new Date('2026-01-15T12:00:00.000Z');
        vi.mocked(repository.users.getDomainUserById).mockResolvedValue({
            id: 'domain-1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            image: 'https://example.com/ada.png',
            emailVerified: true,
            roles: ['user', 'admin'],
            createdAt,
        });
        vi.mocked(repository.users.getIdentitiesForDomainUser).mockResolvedValue([
            {
                authUserId: 'auth-1',
                provider: 'google',
                linkedAt: new Date('2026-01-15T12:00:00.000Z'),
            },
            {
                authUserId: 'auth-2',
                provider: 'credential',
                linkedAt: new Date('2026-02-01T08:30:00.000Z'),
            },
        ]);

        const yoga = createTestYoga({ id: 'domain-1', roles: ['user', 'admin'] });
        const result = await gql(
            yoga,
            `{
                viewer {
                    id
                    name
                    email
                    image
                    emailVerified
                    roles
                    createdAt
                    identities { authUserId provider linkedAt }
                }
            }`,
        );

        expect(result.errors).toBeUndefined();
        expect(result.data?.viewer).toEqual({
            id: 'domain-1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            image: 'https://example.com/ada.png',
            emailVerified: true,
            roles: ['user', 'admin'],
            createdAt: createdAt.toISOString(),
            identities: [
                {
                    authUserId: 'auth-1',
                    provider: 'google',
                    linkedAt: '2026-01-15T12:00:00.000Z',
                },
                {
                    authUserId: 'auth-2',
                    provider: 'credential',
                    linkedAt: '2026-02-01T08:30:00.000Z',
                },
            ],
        });
        expect(repository.users.getDomainUserById).toHaveBeenCalledWith('domain-1');
        expect(repository.users.getIdentitiesForDomainUser).toHaveBeenCalledWith('domain-1');
    });

    it('returns null when the domain user row is missing (e.g. orphan auth_user)', async () => {
        vi.mocked(repository.users.getDomainUserById).mockResolvedValue(null);

        const yoga = createTestYoga({ id: 'domain-missing', roles: ['user'] });
        const result = await gql(yoga, '{ viewer { id } }');
        expect(result.errors).toBeUndefined();
        expect(result.data?.viewer).toBeNull();
    });
});
