/**
 * RBAC Security Verification Tests (PRE_DEPLOYMENT Step 6)
 *
 * Verifies that every mutation and admin-only query correctly enforces
 * role-based access control:
 *   - Guest (no user): expects "Unauthenticated"
 *   - User (role: user): expects "Forbidden"  (admin-gated mutations only)
 *   - Admin (role: admin): expects NO auth error (may fail for other reasons)
 *
 * Viewer-gated (self-service) mutations have a separate matrix — see
 * VIEWER_ONLY_MUTATIONS below. Per-mutation positive coverage lives in
 * account.test.ts; this file pins the "no mutation is publicly callable"
 * property across the whole schema.
 */
import { createYoga } from 'graphql-yoga';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { abilityFor } from '../auth/abilities';
import { builder } from './builder';

// Import schema registrations AFTER mocks
import './football';
import './catalog';
import './workers';
import './config';
import './graphics';
import './viewer';
import './account';
import './predictions';

// Mock ALL modules that schema files import at resolve-time
vi.mock('../db', () => ({
    db: {
        select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
                orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                }),
                limit: vi.fn().mockResolvedValue([]),
                innerJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([]),
                }),
            }),
        }),
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
                onConflictDoNothing: vi.fn().mockResolvedValue([]),
            }),
        }),
        update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ id: 'mock' }]),
                }),
            }),
        }),
    },
}));

vi.mock('../workers/runner', () => ({
    JobRunner: {
        run: vi.fn().mockImplementation((_name: string, task: () => Promise<unknown>) => task()),
    },
}));

vi.mock('../repositories', () => ({
    repository: {
        leagues: {
            getLeagues: vi.fn().mockResolvedValue([]),
            getInternalSeasons: vi.fn().mockResolvedValue([]),
            getAllInternalSeasons: vi.fn().mockResolvedValue([]),
            importSeason: vi.fn().mockResolvedValue({ id: 'mock', year: 2024, leagueId: 'mock' }),
            removeSeason: vi.fn().mockResolvedValue(true),
            updateSeasonConfig: vi
                .fn()
                .mockResolvedValue({ id: 'mock', year: 2024, leagueId: 'mock' }),
            getRankingFormulas: vi.fn().mockResolvedValue([]),
        },
        teams: {
            getTeams: vi.fn().mockResolvedValue([]),
            importSquad: vi.fn().mockResolvedValue([]),
            getTeamRoster: vi.fn().mockResolvedValue([]),
        },
        fixtures: {
            getFixtures: vi.fn().mockResolvedValue([]),
            syncFixtures: vi
                .fn()
                .mockResolvedValue({ data: [], stats: { processedCount: 0, apiCallsCount: 0 } }),
            getMatchEvents: vi.fn().mockResolvedValue([]),
            getLineups: vi.fn().mockResolvedValue([]),
        },
        catalog: {
            getCatalogCountries: vi.fn().mockResolvedValue([]),
            getCatalogLeagues: vi.fn().mockResolvedValue([]),
            syncCatalogLeagues: vi
                .fn()
                .mockResolvedValue({ stats: { processedCount: 0, apiCallsCount: 0 } }),
            promoteLeague: vi.fn().mockResolvedValue({
                id: 'mock',
                name: 'Mock',
                slug: 'mock',
                sourceName: 'test',
                sourceId: 1,
            }),
            refreshCatalogSeasons: vi.fn().mockResolvedValue({ id: 'mock' }),
        },
        players: {
            getPlayerData: vi.fn().mockResolvedValue(null),
            resolvePlayerBySourceId: vi.fn().mockResolvedValue(null),
        },
        config: {
            getDatabaseUrlMasked: vi.fn().mockResolvedValue('postgres://***'),
            getApiFootballKeyMasked: vi.fn().mockResolvedValue('***key***'),
            getSupabaseUrl: vi.fn().mockResolvedValue('https://***'),
            getSupabaseAnonKeyMasked: vi.fn().mockResolvedValue('***anon***'),
            updateDatabaseUrl: vi.fn().mockResolvedValue(true),
            updateApiFootballKey: vi.fn().mockResolvedValue(true),
            updateSupabaseConfig: vi.fn().mockResolvedValue(true),
        },
        predictions: {
            createSnapshot: vi.fn().mockResolvedValue({
                id: 'snap-mock',
                userId: 'mock',
                seasonId: 'mock',
                type: 'projected_finish',
                lockedAt: new Date(),
                deletedAt: null,
            }),
            listSnapshots: vi.fn().mockResolvedValue([]),
            getSnapshotById: vi.fn().mockResolvedValue(null),
            listSnapshotEntries: vi.fn().mockResolvedValue([]),
            listSnapshotEntriesByIds: vi.fn().mockResolvedValue(new Map()),
            softDeleteSnapshot: vi.fn().mockResolvedValue('snap-mock'),
            countSnapshotsInScope: vi.fn().mockResolvedValue(0),
            countGameweeksInSeason: vi.fn().mockResolvedValue(0),
        },
        users: {
            getDomainUserById: vi.fn().mockResolvedValue({
                id: 'mock',
                name: 'Mock',
                email: 'mock@example.com',
                image: null,
                emailVerified: true,
                roles: ['user'],
                createdAt: new Date(),
            }),
            getIdentitiesForDomainUser: vi.fn().mockResolvedValue([]),
            setDomainUserRoles: vi.fn().mockResolvedValue(null),
            updateDomainUserProfile: vi.fn().mockResolvedValue({
                id: 'mock',
                name: 'Mock',
                email: 'mock@example.com',
                image: null,
                emailVerified: true,
                roles: ['user'],
                createdAt: new Date(),
            }),
            getFollowedLeagueIds: vi.fn().mockResolvedValue([]),
            setFollowedLeagueIds: vi.fn().mockResolvedValue([]),
            deleteDomainUser: vi
                .fn()
                .mockResolvedValue({ deletedDomainUserId: 'mock', deletedAuthUserIds: [] }),
        },
    },
}));

vi.mock('../services/graphics.service', () => ({
    graphicsService: {
        registerFromUrl: vi.fn().mockResolvedValue('mock-path'),
        autoSideloadGraphic: vi.fn().mockResolvedValue('mock-path'),
        resolveUrl: vi.fn().mockResolvedValue(null),
    },
}));

vi.mock('../providers/storage', () => ({
    storageProvider: {
        getPublicUrl: vi.fn().mockReturnValue('https://mock.storage/path'),
    },
}));

// ---------------------------------------------------------------------------
// Yoga instances per role
// ---------------------------------------------------------------------------

type TestContext = {
    user?: { id: string; roles: string[] };
    ability: Awaited<ReturnType<typeof abilityFor>>;
};
type YogaInstance = ReturnType<typeof createYoga<TestContext>>;

function createTestYoga(user?: { id: string; roles: string[] }): YogaInstance {
    return createYoga({
        schema: builder.toSchema(),
        maskedErrors: false,
        context: async () => ({ user, ability: await abilityFor(user) }),
    });
}

async function gql(yoga: YogaInstance, query: string, variables?: Record<string, unknown>) {
    const response = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    return response.json() as Promise<{ data?: unknown; errors?: Array<{ message: string }> }>;
}

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------
interface RbacTestCase {
    name: string;
    query: string;
    variables?: Record<string, unknown>;
}

const MUTATIONS: RbacTestCase[] = [
    // catalog.ts
    { name: 'syncCatalog', query: 'mutation { syncCatalog { success processedCount } }' },
    { name: 'promoteLeague', query: 'mutation { promoteLeague(catalogId: "test-id") { id } }' },
    {
        name: 'refreshCatalogSeasons',
        query: 'mutation { refreshCatalogSeasons(catalogId: "test-id") { id } }',
    },
    {
        name: 'importSeason',
        query: 'mutation { importSeason(leagueId: "test-id", year: 2024) { id } }',
    },
    { name: 'removeSeason', query: 'mutation { removeSeason(seasonId: "test-id") }' },
    {
        name: 'updateSeasonConfig',
        query: 'mutation { updateSeasonConfig(seasonId: "test-id", configJson: "{}") { id } }',
    },
    // football.ts
    { name: 'ingestLeagues', query: 'mutation { ingestLeagues { id } }' },
    {
        name: 'syncFixtures',
        query: 'mutation { syncFixtures(leagueSourceId: 39, seasonYear: 2024) { id } }',
    },
    {
        name: 'saveLeagueConfig',
        query: 'mutation { saveLeagueConfig(id: "test-id", configJson: "{}") { id } }',
    },
    {
        name: 'saveSeasonConfig',
        query: 'mutation { saveSeasonConfig(id: "test-id", configJson: "{}") { id } }',
    },
    // workers.ts
    { name: 'runJob', query: 'mutation { runJob(name: "test-job") { id } }' },
    // config.ts
    { name: 'configureDatabase', query: 'mutation { configureDatabase(url: "postgres://test") }' },
    { name: 'configureApiKey', query: 'mutation { configureApiKey(key: "test-key") }' },
    {
        name: 'configureSupabase',
        query: 'mutation { configureSupabase(url: "https://test", anonKey: "key") }',
    },
    { name: 'clearCache', query: 'mutation { clearCache }' },
    // graphics.ts
    {
        name: 'registerGraphic',
        query: 'mutation { registerGraphic(entityId: "test", entityType: "team", url: "https://img.png") }',
    },
    {
        name: 'autoSideloadGraphic',
        query: 'mutation { autoSideloadGraphic(entityId: "test", entityType: "team") }',
    },
    // predictions.ts — `lockInPrediction` is gated on the `predictions`
    // role; the matrix's `user` (roles=['user']) gets Forbidden, admins
    // bypass via `manage all`. `deletePredictionSnapshot` returns NOT_FOUND
    // before the auth check when no snapshot exists, so it's covered in
    // predictions.test.ts rather than here.
    {
        name: 'lockInPrediction',
        query: 'mutation { lockInPrediction(input: { seasonId: "s", type: PROJECTED_FINISH, orderedTeamIds: ["t"] }) { id } }',
    },
];

// Viewer-gated mutations: callable by any authenticated user (including admins).
// Pinned here so a future mutation that *forgets* to gate at all gets caught.
// Per-mutation positive/negative coverage lives in account.test.ts.
const VIEWER_ONLY_MUTATIONS: RbacTestCase[] = [
    {
        name: 'updateMyProfile',
        query: 'mutation { updateMyProfile(name: "New") { id } }',
    },
    {
        name: 'setMyLeagueFollows',
        query: 'mutation { setMyLeagueFollows(leagueIds: []) }',
    },
    // deleteUserAccount uses requireSelfOrAdmin — guests still get Unauthenticated,
    // which is the only property this matrix pins. Self-vs-other behavior is in
    // account.test.ts.
    {
        name: 'deleteUserAccount',
        query: 'mutation { deleteUserAccount(userId: "user-123") }',
    },
];

const ADMIN_QUERIES: RbacTestCase[] = [
    { name: 'configStatus', query: '{ configStatus { isDatabaseConnected } }' },
    { name: 'cacheStats', query: '{ cacheStats { size hitRate } }' },
    { name: 'jobs', query: '{ jobs { id } }' },
    { name: 'jobExecutions', query: '{ jobExecutions { id } }' },
    { name: 'systemLogs', query: '{ systemLogs { id } }' },
    { name: 'catalogCountries', query: '{ catalogCountries { id } }' },
    { name: 'catalogLeagues', query: '{ catalogLeagues { id } }' },
    // graphics.ts — was previously missing auth, now correctly gated
    { name: 'graphics', query: '{ graphics(entityType: "team") { id } }' },
];

describe('RBAC Security Verification', () => {
    let guestYoga: YogaInstance;
    let userYoga: YogaInstance;
    let adminYoga: YogaInstance;

    beforeAll(() => {
        guestYoga = createTestYoga(undefined);
        userYoga = createTestYoga({ id: 'user-123', roles: ['user'] });
        adminYoga = createTestYoga({ id: 'admin-456', roles: ['admin'] });
    });

    // -----------------------------------------------------------------------
    // Mutations
    // -----------------------------------------------------------------------
    describe('Mutations — Guest (unauthenticated)', () => {
        it.each(MUTATIONS)('$name → Unauthenticated', async ({ query }) => {
            const result = await gql(guestYoga, query);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].message).toContain('Unauthenticated');
        });
    });

    describe('Mutations — User (authenticated, non-admin)', () => {
        it.each(MUTATIONS)('$name → Forbidden', async ({ query }) => {
            const result = await gql(userYoga, query);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].message).toContain('Forbidden');
        });
    });

    describe('Mutations — Admin (granted)', () => {
        it.each(MUTATIONS)('$name → no auth error', async ({ query }) => {
            const result = await gql(adminYoga, query);
            // Admin should never get an auth-related error
            const authErrors = (result.errors || []).filter(
                (e) => e.message.includes('Unauthenticated') || e.message.includes('Forbidden'),
            );
            expect(authErrors).toHaveLength(0);
        });
    });

    // -----------------------------------------------------------------------
    // Viewer-Only Mutations (self-service: auth required, no admin role needed)
    // -----------------------------------------------------------------------
    describe('Viewer Mutations — Guest (unauthenticated)', () => {
        it.each(VIEWER_ONLY_MUTATIONS)('$name → Unauthenticated', async ({ query }) => {
            const result = await gql(guestYoga, query);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].message).toContain('Unauthenticated');
        });
    });

    describe('Viewer Mutations — User (granted, acting on self)', () => {
        it.each(VIEWER_ONLY_MUTATIONS)('$name → no auth error', async ({ query }) => {
            // user-123 is the test user. deleteUserAccount targets user-123 above,
            // so the requireSelfOrAdmin check passes.
            const result = await gql(userYoga, query);
            const authErrors = (result.errors || []).filter(
                (e) => e.message.includes('Unauthenticated') || e.message.includes('Forbidden'),
            );
            expect(authErrors).toHaveLength(0);
        });
    });

    // -----------------------------------------------------------------------
    // Admin-Only Queries
    // -----------------------------------------------------------------------
    describe('Admin Queries — Guest (unauthenticated)', () => {
        it.each(ADMIN_QUERIES)('$name → Unauthenticated', async ({ query }) => {
            const result = await gql(guestYoga, query);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].message).toContain('Unauthenticated');
        });
    });

    describe('Admin Queries — User (authenticated, non-admin)', () => {
        it.each(ADMIN_QUERIES)('$name → Forbidden', async ({ query }) => {
            const result = await gql(userYoga, query);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].message).toContain('Forbidden');
        });
    });

    describe('Admin Queries — Admin (granted)', () => {
        it.each(ADMIN_QUERIES)('$name → no auth error', async ({ query }) => {
            const result = await gql(adminYoga, query);
            const authErrors = (result.errors || []).filter(
                (e) => e.message.includes('Unauthenticated') || e.message.includes('Forbidden'),
            );
            expect(authErrors).toHaveLength(0);
        });
    });
});
