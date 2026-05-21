/**
 * RBAC Security Verification Tests (PRE_DEPLOYMENT Step 6)
 *
 * Verifies that every mutation and admin-only query correctly enforces
 * role-based access control:
 *   - Guest (no user): expects "Unauthenticated"
 *   - User (role: user): expects "Forbidden"
 *   - Admin (role: admin): expects NO auth error (may fail for other reasons)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { builder } from './builder';

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
            updateSeasonConfig: vi.fn().mockResolvedValue({ id: 'mock', year: 2024, leagueId: 'mock' }),
            getRankingFormulas: vi.fn().mockResolvedValue([]),
        },
        teams: {
            getTeams: vi.fn().mockResolvedValue([]),
            importSquad: vi.fn().mockResolvedValue([]),
            getTeamRoster: vi.fn().mockResolvedValue([]),
        },
        fixtures: {
            getFixtures: vi.fn().mockResolvedValue([]),
            syncFixtures: vi.fn().mockResolvedValue({ data: [], stats: { processedCount: 0, apiCallsCount: 0 } }),
            getMatchEvents: vi.fn().mockResolvedValue([]),
            getLineups: vi.fn().mockResolvedValue([]),
        },
        catalog: {
            getCatalogCountries: vi.fn().mockResolvedValue([]),
            getCatalogLeagues: vi.fn().mockResolvedValue([]),
            syncCatalogLeagues: vi.fn().mockResolvedValue({ stats: { processedCount: 0, apiCallsCount: 0 } }),
            promoteLeague: vi.fn().mockResolvedValue({ id: 'mock', name: 'Mock', slug: 'mock', sourceName: 'test', sourceId: 1 }),
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

// Import schema registrations AFTER mocks
import './football';
import './catalog';
import './workers';
import './config';
import './graphics';

// ---------------------------------------------------------------------------
// Yoga instances per role
// ---------------------------------------------------------------------------

type TestContext = { user?: { id: string; roles: string[] } };
type YogaInstance = ReturnType<typeof createYoga<TestContext>>;

function createTestYoga(user?: { id: string; roles: string[] }): YogaInstance {
    return createYoga({
        schema: builder.toSchema(),
        maskedErrors: false,
        context: () => ({ user }),
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
    { name: 'refreshCatalogSeasons', query: 'mutation { refreshCatalogSeasons(catalogId: "test-id") { id } }' },
    { name: 'importSeason', query: 'mutation { importSeason(leagueId: "test-id", year: 2024) { id } }' },
    { name: 'removeSeason', query: 'mutation { removeSeason(seasonId: "test-id") }' },
    { name: 'updateSeasonConfig', query: 'mutation { updateSeasonConfig(seasonId: "test-id", configJson: "{}") { id } }' },
    // football.ts
    { name: 'ingestLeagues', query: 'mutation { ingestLeagues { id } }' },
    { name: 'syncFixtures', query: 'mutation { syncFixtures(leagueSourceId: 39, seasonYear: 2024) { id } }' },
    { name: 'saveLeagueConfig', query: 'mutation { saveLeagueConfig(id: "test-id", configJson: "{}") { id } }' },
    { name: 'saveSeasonConfig', query: 'mutation { saveSeasonConfig(id: "test-id", configJson: "{}") { id } }' },
    // workers.ts
    { name: 'runJob', query: 'mutation { runJob(name: "test-job") { id } }' },
    // config.ts
    { name: 'configureDatabase', query: 'mutation { configureDatabase(url: "postgres://test") }' },
    { name: 'configureApiKey', query: 'mutation { configureApiKey(key: "test-key") }' },
    { name: 'configureSupabase', query: 'mutation { configureSupabase(url: "https://test", anonKey: "key") }' },
    { name: 'clearCache', query: 'mutation { clearCache }' },
    // graphics.ts
    { name: 'registerGraphic', query: 'mutation { registerGraphic(entityId: "test", entityType: "team", url: "https://img.png") }' },
    { name: 'autoSideloadGraphic', query: 'mutation { autoSideloadGraphic(entityId: "test", entityType: "team") }' },
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
                (e) => e.message.includes('Unauthenticated') || e.message.includes('Forbidden')
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
                (e) => e.message.includes('Unauthenticated') || e.message.includes('Forbidden')
            );
            expect(authErrors).toHaveLength(0);
        });
    });
});
