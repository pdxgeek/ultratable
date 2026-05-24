/**
 * Tier-lists resolver tests (issue #112).
 *
 * Covers the auth matrix, recipe dispatch, payload validation, caps
 * (counting soft-deleted), tier-key resolution, idempotent soft-delete.
 * The repository is the type-checked mock so this file pins the resolver
 * contract without touching Postgres — the real DB round-trip lives in
 * `repositories/tier-lists.repository.integration.test.ts`.
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { abilityFor } from '../auth/abilities';
import {
    MAX_ITEMS_PER_TIER_LIST,
    MAX_TIER_LISTS_PER_USER_PER_SEASON,
} from '../config/tier-lists';
import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { builder } from './builder';

import './viewer';
import './football';
import './tier-lists';

vi.mock('../db', () => ({
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

type Ctx = {
    user?: { id: string; roles: string[] };
    loaders: ReturnType<typeof createLoaders>;
    ability: Awaited<ReturnType<typeof abilityFor>>;
};
type YogaInstance = ReturnType<typeof createYoga<Ctx>>;

function createTestYoga(user?: Ctx['user']): YogaInstance {
    return createYoga({
        schema: builder.toSchema(),
        maskedErrors: false,
        context: async () => ({
            user,
            loaders: createLoaders(),
            ability: await abilityFor(user),
        }),
    });
}

async function gql(
    yoga: YogaInstance,
    query: string,
    variables?: Record<string, unknown>,
): Promise<{
    data?: Record<string, unknown>;
    errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}> {
    const res = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    return res.json() as Promise<{
        data?: Record<string, unknown>;
        errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
    }>;
}

const TL_USER = { id: 'user-owner', roles: ['user', 'tier-lists'] };
const TL_OTHER = { id: 'user-other', roles: ['user', 'tier-lists'] };
const PLAIN_USER = { id: 'user-plain', roles: ['user'] };
const ADMIN_USER = { id: 'admin-1', roles: ['admin'] };

const SEASON_ID = '00000000-0000-0000-0000-000000000001';
const TIER_LIST_ID = '00000000-0000-0000-0000-0000000000a1';
const ITEM_ID = '00000000-0000-0000-0000-0000000000b1';
const TEAM_ID = '00000000-0000-0000-0000-0000000000d1';
const FIXTURE_ID = '00000000-0000-0000-0000-0000000000e1';

function tierList(overrides: Partial<{ id: string; userId: string; tierRankableTypeId: string; tiers: { key: string; name: string }[] }> = {}) {
    return {
        id: overrides.id ?? TIER_LIST_ID,
        userId: overrides.userId ?? TL_USER.id,
        seasonId: SEASON_ID,
        tierRankableTypeId: overrides.tierRankableTypeId ?? 'coach',
        title: 'My Tier List',
        tiers: overrides.tiers ?? [
            { key: 'tier-s', name: 'S' },
            { key: 'tier-a', name: 'A' },
            { key: 'tier-b', name: 'B' },
            { key: 'tier-c', name: 'C' },
        ],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
    };
}

function item(
    overrides: Partial<{ id: string; tierListId: string; tierKey: string | null; nameOverride: string | null }> = {},
) {
    return {
        id: overrides.id ?? ITEM_ID,
        tierListId: overrides.tierListId ?? TIER_LIST_ID,
        tierRankableTypeId: 'coach',
        naturalKey: `${TEAM_ID}|pep guardiola`,
        tierKey: overrides.tierKey === undefined ? null : overrides.tierKey,
        position: 1.0,
        name: 'Pep Guardiola',
        imageUrl: null,
        teamId: TEAM_ID,
        sourceType: 'fixture',
        sourceId: FIXTURE_ID,
        sourcePath: { teamSourceId: 50 },
        nameOverride: overrides.nameOverride === undefined ? null : overrides.nameOverride,
        imageUrlOverride: null,
        subtitle: null,
        addedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.tierLists.getTierRankableTypeById).mockImplementation(async (id) =>
        id === 'coach' ? { id: 'coach', name: 'Coach', defaultFormulaId: null } : null,
    );
});

// ---------------------------------------------------------------------------
// Mutation.createTierList
// ---------------------------------------------------------------------------
describe('Mutation.createTierList', () => {
    const QUERY = `
        mutation($seasonId: ID!, $tierRankableTypeId: String!, $title: String!) {
            createTierList(seasonId: $seasonId, tierRankableTypeId: $tierRankableTypeId, title: $title) {
                id title tierRankableTypeId tiers { key name }
            }
        }
    `;
    const VARS = { seasonId: SEASON_ID, tierRankableTypeId: 'coach', title: 'Best Coaches' };

    it('rejects guests with Unauthenticated', async () => {
        const result = await gql(createTestYoga(undefined), QUERY, VARS);
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
    });

    it('rejects users without the tier-lists role', async () => {
        const result = await gql(createTestYoga(PLAIN_USER), QUERY, VARS);
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
    });

    it('rejects unknown recipes with UNKNOWN_TIER_RANKABLE_TYPE', async () => {
        const result = await gql(createTestYoga(TL_USER), QUERY, { ...VARS, tierRankableTypeId: 'bogus' });
        expect(result.errors?.[0].extensions?.code).toBe('UNKNOWN_TIER_RANKABLE_TYPE');
    });

    it('rejects blank titles', async () => {
        const result = await gql(createTestYoga(TL_USER), QUERY, { ...VARS, title: '   ' });
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_TITLE');
    });

    it('enforces TIER_LIST_LIMIT_REACHED at cap', async () => {
        vi.mocked(repository.tierLists.countTierListsInScope).mockResolvedValue(
            MAX_TIER_LISTS_PER_USER_PER_SEASON,
        );
        const result = await gql(createTestYoga(TL_USER), QUERY, VARS);
        expect(result.errors?.[0].extensions?.code).toBe('TIER_LIST_LIMIT_REACHED');
    });

    it('initialises the default tier scheme on success', async () => {
        vi.mocked(repository.tierLists.countTierListsInScope).mockResolvedValue(0);
        vi.mocked(repository.tierLists.createTierList).mockResolvedValue(tierList());
        const result = await gql(createTestYoga(TL_USER), QUERY, VARS);
        expect(result.errors).toBeUndefined();
        expect(repository.tierLists.createTierList).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: TL_USER.id,
                seasonId: SEASON_ID,
                tierRankableTypeId: 'coach',
                title: 'Best Coaches',
                tiers: expect.arrayContaining([
                    expect.objectContaining({ name: 'S' }),
                    expect.objectContaining({ name: 'F' }),
                ]),
            }),
        );
    });

    it('lets admins create tier lists', async () => {
        vi.mocked(repository.tierLists.countTierListsInScope).mockResolvedValue(0);
        vi.mocked(repository.tierLists.createTierList).mockResolvedValue(
            tierList({ userId: ADMIN_USER.id }),
        );
        const result = await gql(createTestYoga(ADMIN_USER), QUERY, VARS);
        expect(result.errors).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Mutation.updateTierListTiers
// ---------------------------------------------------------------------------
describe('Mutation.updateTierListTiers', () => {
    const QUERY = `
        mutation($id: ID!, $tiers: [TierInput!]!) {
            updateTierListTiers(id: $id, tiers: $tiers) { id tiers { key name } }
        }
    `;

    it("rejects another user", async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        const result = await gql(createTestYoga(TL_OTHER), QUERY, {
            id: TIER_LIST_ID,
            tiers: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
        });
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
    });

    it('rejects fewer tiers than MIN_TIERS', async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        const result = await gql(createTestYoga(TL_USER), QUERY, {
            id: TIER_LIST_ID, tiers: [{ name: 'A' }, { name: 'B' }],
        });
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_TIER_COUNT');
    });

    it('rejects more tiers than MAX_TIERS', async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        const result = await gql(createTestYoga(TL_USER), QUERY, {
            id: TIER_LIST_ID,
            tiers: Array.from({ length: 9 }, (_, i) => ({ name: `T${i}` })),
        });
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_TIER_COUNT');
    });

    it('preserves existing keys and mints fresh ones', async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        vi.mocked(repository.tierLists.updateTierListTiers).mockResolvedValue(tierList());
        await gql(createTestYoga(TL_USER), QUERY, {
            id: TIER_LIST_ID,
            tiers: [
                { key: 'tier-s', name: 'GOAT' },
                { key: 'tier-a', name: 'A' },
                { name: 'NEW' },
            ],
        });
        const passed = vi.mocked(repository.tierLists.updateTierListTiers).mock.calls[0][1];
        expect(passed[0]).toEqual({ key: 'tier-s', name: 'GOAT' });
        expect(passed[2].name).toBe('NEW');
        expect(passed[2].key).toMatch(/^tier-/);
    });

    it('rejects duplicate tier keys', async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        const result = await gql(createTestYoga(TL_USER), QUERY, {
            id: TIER_LIST_ID,
            tiers: [
                { key: 'tier-s', name: 'S' },
                { key: 'tier-s', name: 'duplicate' },
                { key: 'tier-c', name: 'C' },
            ],
        });
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_TIER_COUNT');
    });
});

// ---------------------------------------------------------------------------
// Mutation.deleteTierList
// ---------------------------------------------------------------------------
describe('Mutation.deleteTierList', () => {
    const QUERY = `mutation($id: ID!) { deleteTierList(id: $id) }`;

    it("rejects another user", async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        const result = await gql(createTestYoga(TL_OTHER), QUERY, { id: TIER_LIST_ID });
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
    });

    it('lets owner soft-delete', async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        vi.mocked(repository.tierLists.softDeleteTierList).mockResolvedValue(TIER_LIST_ID);
        const result = await gql(createTestYoga(TL_USER), QUERY, { id: TIER_LIST_ID });
        expect(result.errors).toBeUndefined();
        expect(result.data?.deleteTierList).toBe(TIER_LIST_ID);
    });

    it('is idempotent on already-deleted rows', async () => {
        const deleted = { ...tierList(), deletedAt: new Date() };
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(deleted);
        vi.mocked(repository.tierLists.softDeleteTierList).mockResolvedValue(TIER_LIST_ID);
        const result = await gql(createTestYoga(TL_USER), QUERY, { id: TIER_LIST_ID });
        expect(result.errors).toBeUndefined();
        expect(repository.tierLists.getTierListById).toHaveBeenCalledWith({
            id: TIER_LIST_ID, includeDeleted: true,
        });
    });
});

// ---------------------------------------------------------------------------
// Mutation.addTierRankableItem
// ---------------------------------------------------------------------------
describe('Mutation.addTierRankableItem', () => {
    const QUERY = `
        mutation($input: AddTierRankableItemInput!) {
            addTierRankableItem(input: $input) {
                id displayName naturalKey tierRankableTypeId
            }
        }
    `;

    function input(overrides: Partial<Record<string, unknown>> = {}) {
        return {
            input: {
                tierListId: TIER_LIST_ID,
                tierRankableTypeId: 'coach',
                naturalKey: `${TEAM_ID}|pep guardiola`,
                name: 'Pep Guardiola',
                teamId: TEAM_ID,
                sourceType: 'fixture',
                sourceId: FIXTURE_ID,
                sourcePath: { teamSourceId: 50 },
                ...overrides,
            },
        };
    }

    beforeEach(() => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([
            {
                id: TEAM_ID, name: 'Man City', shortName: null, tla: null, logo: null,
                venueId: null, sourceName: 'test', sourceId: 1, metadata: null, rawResponse: null,
                createdAt: new Date(), updatedAt: new Date(),
            },
        ]);
    });

    it('rejects guests with Unauthenticated', async () => {
        const result = await gql(createTestYoga(undefined), QUERY, input());
        expect(result.errors?.[0].message).toMatch(/Unauthenticated/);
    });

    it("rejects another user", async () => {
        const result = await gql(createTestYoga(TL_OTHER), QUERY, input());
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
    });

    it('rejects RECIPE_MISMATCH when recipe differs from parent', async () => {
        const result = await gql(createTestYoga(TL_USER), QUERY, input({ tierRankableTypeId: 'player' }));
        expect(result.errors?.[0].extensions?.code).toBe('RECIPE_MISMATCH');
    });

    it('rejects blank names', async () => {
        const result = await gql(createTestYoga(TL_USER), QUERY, input({ name: '   ' }));
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_ITEM');
    });

    it('rejects blank natural key', async () => {
        const result = await gql(createTestYoga(TL_USER), QUERY, input({ naturalKey: '   ' }));
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_ITEM');
    });

    it('rejects INVALID_SOURCE_POINTER on partial source', async () => {
        const result = await gql(createTestYoga(TL_USER), QUERY, input({ sourceType: 'fixture', sourceId: null }));
        expect(result.errors?.[0].extensions?.code).toBe('INVALID_SOURCE_POINTER');
    });

    it('rejects TEAM_NOT_FOUND when teamId is unknown', async () => {
        vi.mocked(repository.teams.getTeamsByIds).mockResolvedValue([]);
        const result = await gql(createTestYoga(TL_USER), QUERY, input());
        expect(result.errors?.[0].extensions?.code).toBe('TEAM_NOT_FOUND');
    });

    it('rejects ITEM_LIMIT_REACHED at cap', async () => {
        vi.mocked(repository.tierLists.countItemsForTierList).mockResolvedValue(
            MAX_ITEMS_PER_TIER_LIST,
        );
        const result = await gql(createTestYoga(TL_USER), QUERY, input());
        expect(result.errors?.[0].extensions?.code).toBe('ITEM_LIMIT_REACHED');
    });

    it('inserts the snapshot verbatim on success', async () => {
        vi.mocked(repository.tierLists.countItemsForTierList).mockResolvedValue(0);
        vi.mocked(repository.tierLists.addTierRankableItem).mockResolvedValue(item());
        const result = await gql(createTestYoga(TL_USER), QUERY, input({
            imageUrl: 'https://example.com/pep.png',
        }));
        expect(result.errors).toBeUndefined();
        expect(repository.tierLists.addTierRankableItem).toHaveBeenCalledWith({
            tierListId: TIER_LIST_ID,
            tierRankableTypeId: 'coach',
            naturalKey: `${TEAM_ID}|pep guardiola`,
            name: 'Pep Guardiola',
            imageUrl: 'https://example.com/pep.png',
            teamId: TEAM_ID,
            sourceType: 'fixture',
            sourceId: FIXTURE_ID,
            sourcePath: { teamSourceId: 50 },
        });
    });
});

// ---------------------------------------------------------------------------
// Mutation.updateTierRankableItemOverrides
// ---------------------------------------------------------------------------
describe('Mutation.updateTierRankableItemOverrides', () => {
    const QUERY = `
        mutation($input: UpdateTierRankableItemOverridesInput!) {
            updateTierRankableItemOverrides(input: $input) {
                id nameOverride displayName
            }
        }
    `;

    beforeEach(() => {
        vi.mocked(repository.tierLists.getTierRankableItemById).mockResolvedValue(item());
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
    });

    it("rejects another user", async () => {
        const result = await gql(createTestYoga(TL_OTHER), QUERY, {
            input: { itemId: ITEM_ID, nameOverride: 'My Pep' },
        });
        expect(result.errors?.[0].message).toMatch(/Forbidden/);
    });

    it('sets a name override and displayName falls back through it', async () => {
        vi.mocked(repository.tierLists.updateTierRankableItemOverrides).mockResolvedValue(
            item({ nameOverride: 'My Pep' }),
        );
        const result = await gql(createTestYoga(TL_USER), QUERY, {
            input: { itemId: ITEM_ID, nameOverride: 'My Pep' },
        });
        expect(result.errors).toBeUndefined();
        const data = result.data?.updateTierRankableItemOverrides as { nameOverride: string; displayName: string };
        expect(data.nameOverride).toBe('My Pep');
        expect(data.displayName).toBe('My Pep');
    });

    it('passes null to clear an override (distinct from undefined)', async () => {
        vi.mocked(repository.tierLists.updateTierRankableItemOverrides).mockResolvedValue(item());
        await gql(createTestYoga(TL_USER), QUERY, {
            input: { itemId: ITEM_ID, nameOverride: null },
        });
        expect(repository.tierLists.updateTierRankableItemOverrides).toHaveBeenCalledWith({
            itemId: ITEM_ID,
            nameOverride: null,
            imageUrlOverride: undefined,
            subtitle: undefined,
        });
    });
});

// ---------------------------------------------------------------------------
// Mutation.moveTierRankableItem
// ---------------------------------------------------------------------------
describe('Mutation.moveTierRankableItem', () => {
    const QUERY = `
        mutation($itemId: ID!, $tierKey: String, $position: Float!) {
            moveTierRankableItem(itemId: $itemId, tierKey: $tierKey, position: $position) { id tierKey position }
        }
    `;

    beforeEach(() => {
        vi.mocked(repository.tierLists.getTierRankableItemById).mockResolvedValue(item());
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
    });

    it('rejects UNKNOWN_TIER_KEY', async () => {
        const result = await gql(createTestYoga(TL_USER), QUERY, {
            itemId: ITEM_ID, tierKey: 'tier-bogus', position: 1.5,
        });
        expect(result.errors?.[0].extensions?.code).toBe('UNKNOWN_TIER_KEY');
    });

    it('accepts tierKey null (pool)', async () => {
        vi.mocked(repository.tierLists.moveTierRankableItem).mockResolvedValue(item());
        const result = await gql(createTestYoga(TL_USER), QUERY, {
            itemId: ITEM_ID, tierKey: null, position: 1.5,
        });
        expect(result.errors).toBeUndefined();
    });

    it('accepts known tierKey', async () => {
        vi.mocked(repository.tierLists.moveTierRankableItem).mockResolvedValue(item({ tierKey: 'tier-s' }));
        const result = await gql(createTestYoga(TL_USER), QUERY, {
            itemId: ITEM_ID, tierKey: 'tier-s', position: 2.5,
        });
        expect(result.errors).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Query.tierRankableTypes
// ---------------------------------------------------------------------------
describe('Query.tierRankableTypes', () => {
    it('returns the recipe registry', async () => {
        vi.mocked(repository.tierLists.listTierRankableTypes).mockResolvedValue([
            { id: 'coach', name: 'Coach', defaultFormulaId: null },
        ]);
        const result = await gql(createTestYoga(TL_USER), `query { tierRankableTypes { id name } }`);
        expect(result.errors).toBeUndefined();
        expect(result.data?.tierRankableTypes).toEqual([{ id: 'coach', name: 'Coach' }]);
    });
});

// ---------------------------------------------------------------------------
// Query.myTierLists
// ---------------------------------------------------------------------------
describe('Query.myTierLists', () => {
    const QUERY = `
        query($seasonId: ID!, $tierRankableTypeId: String) {
            myTierLists(seasonId: $seasonId, tierRankableTypeId: $tierRankableTypeId) { id title tierRankableTypeId }
        }
    `;

    it('returns [] for guests', async () => {
        const result = await gql(createTestYoga(undefined), QUERY, { seasonId: SEASON_ID });
        expect(result.errors).toBeUndefined();
        expect(result.data?.myTierLists).toEqual([]);
    });

    it('lists with optional recipe filter', async () => {
        vi.mocked(repository.tierLists.listTierLists).mockResolvedValue([tierList({ id: 'a' })]);
        await gql(createTestYoga(TL_USER), QUERY, { seasonId: SEASON_ID, tierRankableTypeId: 'coach' });
        expect(repository.tierLists.listTierLists).toHaveBeenCalledWith({
            userId: TL_USER.id,
            seasonId: SEASON_ID,
            tierRankableTypeId: 'coach',
        });
    });
});

// ---------------------------------------------------------------------------
// displayName / displayImageUrl fallbacks
// ---------------------------------------------------------------------------
describe('TierRankableItem display fallbacks', () => {
    it('displayName uses nameOverride when set, snapshot when null', async () => {
        vi.mocked(repository.tierLists.getTierListById).mockResolvedValue(tierList());
        vi.mocked(repository.tierLists.listItemsByTierListIds).mockResolvedValue(
            new Map([
                [TIER_LIST_ID, [
                    item({ id: 'a', nameOverride: 'The Catalan' }),
                    item({ id: 'b', nameOverride: null }),
                ]],
            ]),
        );
        const result = await gql(
            createTestYoga(TL_USER),
            `query($id: ID!) { tierList(id: $id) { items { id displayName } } }`,
            { id: TIER_LIST_ID },
        );
        expect(result.errors).toBeUndefined();
        const data = (result.data?.tierList as { items: Array<{ id: string; displayName: string }> }).items;
        expect(data.find((i) => i.id === 'a')?.displayName).toBe('The Catalan');
        expect(data.find((i) => i.id === 'b')?.displayName).toBe('Pep Guardiola');
    });
});
