/**
 * Mutation → cache invalidation wiring tests — issue #53.
 *
 * #21 (cache mechanics) and #20 (repository CRUD) each covered one half of the
 * picture. This file pins the wiring between them: when a GraphQL mutation
 * runs, it invalidates the right cache prefix.
 *
 * Why we test it at the schema level:
 *
 *   - Several mutations invalidate at the resolver (`cacheService.invalidate`
 *     called directly inside the resolve()). Those are tested here.
 *   - A few mutations rely on the repository to invalidate (e.g. importSquad
 *     calls `repository.teams.importSquad`, which itself calls invalidate).
 *     With a mocked repository those tests would be vacuous — they're covered
 *     by `postgres.subrepos.integration.test.ts`.
 *
 * Pattern per test:
 *   1. Pre-populate the cache at the prefix we expect to be cleared.
 *   2. Run the GraphQL mutation through a real Yoga + Pothos schema.
 *   3. Assert `cacheService.get(key)` is `undefined`.
 */
import { createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema';
import { createLoaders } from '../loaders';
import { repository } from '../repositories';
import { cacheService } from '../services/cache.service';
import { builder } from './builder';

import './football';
import './catalog';

vi.mock('../db', () => ({ db: { select: vi.fn(), insert: vi.fn() } }));

vi.mock('../workers/runner', () => {
    const stubReporter = { updateProgress: async () => {} };
    return {
        JobRunner: {
            run: vi
                .fn()
                .mockImplementation(
                    (_name: string, task: (reporter: unknown) => Promise<unknown>) =>
                        task(stubReporter),
                ),
            runInBackground: vi
                .fn()
                .mockImplementation(
                    async (_name: string, task: (reporter: unknown) => Promise<unknown>) => {
                        await task(stubReporter);
                        return { id: 'mock-exec', status: 'success', jobId: 'mock-job' };
                    },
                ),
        },
    };
});

vi.mock('../repositories', async () => {
    const { buildMockRepository } = await import('../repositories/__fixtures__/mockRepository');
    return { repository: buildMockRepository() };
});

const adminYoga = createYoga({
    schema: builder.toSchema(),
    context: () => ({
        user: { id: 'admin-1', roles: ['admin'] },
        loaders: createLoaders(),
    }),
});

async function fire(query: string): Promise<{
    errors?: Array<{ message: string }>;
    data?: Record<string, unknown>;
}> {
    const res = await adminYoga.fetch('http://localhost:8080/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    return res.json();
}

describe('Mutation → cache invalidation wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        cacheService.clear();
    });

    describe('football schema', () => {
        it('saveLeagueConfig invalidates the `leagues` cache', async () => {
            vi.mocked(repository.leagues.updateLeagueConfig).mockResolvedValue({
                id: 'l1',
                sourceId: 39,
            } as unknown as typeof schema.leagues.$inferSelect);

            cacheService.set('leagues', [{ stale: true }], 60_000);
            cacheService.set('leagues:by-id:l1', { stale: true }, 60_000);
            expect(cacheService.get('leagues')).toBeDefined();

            const result = await fire(
                `mutation { saveLeagueConfig(id: "l1", configJson: "{\\"promo\\":2}") { id } }`,
            );
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('leagues')).toBeUndefined();
            expect(cacheService.get('leagues:by-id:l1')).toBeUndefined();
        });

        it('saveSeasonConfig invalidates the `seasons` cache', async () => {
            vi.mocked(repository.leagues.updateSeasonConfig).mockResolvedValue({
                id: 's1',
                year: 2024,
                leagueId: 'l1',
            } as unknown as typeof schema.seasons.$inferSelect);

            cacheService.set('seasons:all', [{ stale: true }], 60_000);
            cacheService.set('seasons:by-league:l1', [{ stale: true }], 60_000);

            const result = await fire(
                `mutation { saveSeasonConfig(id: "s1", configJson: "{}") { id } }`,
            );
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('seasons:all')).toBeUndefined();
            expect(cacheService.get('seasons:by-league:l1')).toBeUndefined();
        });

        it('saveSeasonConfig persists rankingCriteria into metadata before invalidating', async () => {
            const update = vi.fn().mockResolvedValue({ id: 's1' });
            vi.mocked(repository.leagues.updateSeasonConfig).mockImplementation(update);

            cacheService.set('seasons:all', [{ stale: true }], 60_000);

            const result = await fire(
                `mutation { saveSeasonConfig(id: "s1", configJson: "{\\"a\\":1}", rankingCriteria: ["standard_pts","goal_diff"]) { id } }`,
            );
            expect(result.errors).toBeUndefined();
            expect(update).toHaveBeenCalledWith(
                's1',
                expect.objectContaining({
                    a: 1,
                    rankingCriteria: ['standard_pts', 'goal_diff'],
                }),
            );
            expect(cacheService.get('seasons:all')).toBeUndefined();
        });

        it('ingestLeagues invalidates the `leagues` cache', async () => {
            vi.mocked(repository.leagues.getLeagues).mockResolvedValue([]);
            cacheService.set('leagues', [{ stale: true }], 60_000);
            cacheService.set('leagues:by-id:l1', { stale: true }, 60_000);

            const result = await fire(`mutation { ingestLeagues { id } }`);
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('leagues')).toBeUndefined();
            expect(cacheService.get('leagues:by-id:l1')).toBeUndefined();
        });

        // Fixture-sync cache invalidation moved from the resolver into
        // `repository.fixtures.syncFixtures()` when the GraphQL mutation
        // was retired in favour of `runJob(name: "sync-fixtures-*")`. It's
        // pinned at the integration layer in
        // postgres.subrepos.integration.test.ts where a real repo is wired
        // up, so no schema-level mirror is needed here.
    });

    describe('catalog schema', () => {
        it('promoteLeague invalidates the `leagues` cache', async () => {
            vi.mocked(repository.catalog.promoteLeague).mockResolvedValue({
                id: 'l1',
                sourceId: 39,
            } as unknown as typeof schema.leagues.$inferSelect);

            cacheService.set('leagues', [{ stale: true }], 60_000);

            const result = await fire(`mutation { promoteLeague(catalogId: "cat-1") { id } }`);
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('leagues')).toBeUndefined();
        });

        it('importSeason invalidates both `seasons` and `leagues`', async () => {
            vi.mocked(repository.leagues.importSeason).mockResolvedValue({
                id: 's1',
                year: 2024,
                leagueId: 'l1',
            } as unknown as typeof schema.seasons.$inferSelect);

            cacheService.set('seasons:all', [{ stale: true }], 60_000);
            cacheService.set('leagues', [{ stale: true }], 60_000);

            const result = await fire(
                `mutation { importSeason(leagueId: "l1", year: 2024) { id } }`,
            );
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('seasons:all')).toBeUndefined();
            expect(cacheService.get('leagues')).toBeUndefined();
        });

        it('removeSeason invalidates seasons, leagues, and fixtures', async () => {
            vi.mocked(repository.leagues.removeSeason).mockResolvedValue(true);

            cacheService.set('seasons:all', [{ stale: true }], 60_000);
            cacheService.set('seasons:by-league:l1', [{ stale: true }], 60_000);
            cacheService.set('leagues', [{ stale: true }], 60_000);
            cacheService.set('fixtures:season:s1', [{ stale: true }], 60_000);
            cacheService.set('fixtures:39:2024', [{ stale: true }], 60_000);

            const result = await fire(`mutation { removeSeason(seasonId: "s1") }`);
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('seasons:all')).toBeUndefined();
            expect(cacheService.get('seasons:by-league:l1')).toBeUndefined();
            expect(cacheService.get('leagues')).toBeUndefined();
            expect(cacheService.get('fixtures:season:s1')).toBeUndefined();
            expect(cacheService.get('fixtures:39:2024')).toBeUndefined();
        });

        it('syncCatalog invalidates the `catalog:` prefix', async () => {
            vi.mocked(repository.catalog.syncCatalogLeagues).mockResolvedValue({
                data: [],
                stats: { processedCount: 0, apiCallsCount: 0 },
            });

            cacheService.set('catalog:leagues:all', [{ stale: true }], 60_000);
            cacheService.set('catalog:countries', [{ stale: true }], 60_000);
            cacheService.set('leagues', [{ untouched: true }], 60_000);

            const result = await fire(`mutation { syncCatalog { success processedCount } }`);
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('catalog:leagues:all')).toBeUndefined();
            expect(cacheService.get('catalog:countries')).toBeUndefined();
            // Prefix `catalog:` must not collide with `leagues`.
            expect(cacheService.get('leagues')).toEqual([{ untouched: true }]);
        });

        it('syncCountryLeagues invalidates the `catalog:` prefix', async () => {
            vi.mocked(repository.catalog.syncCatalogLeagues).mockResolvedValue({
                data: [],
                stats: { processedCount: 0, apiCallsCount: 0 },
            });
            vi.mocked(repository.catalog.getCatalogLeagues).mockResolvedValue([]);

            cacheService.set('catalog:leagues:GBR', [{ stale: true }], 60_000);

            const result = await fire(
                `mutation { syncCountryLeagues(countryId: "country-1") { id } }`,
            );
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('catalog:leagues:GBR')).toBeUndefined();
        });

        it('refreshCatalogSeasons invalidates the `catalog:` prefix', async () => {
            vi.mocked(repository.catalog.refreshCatalogSeasons).mockResolvedValue({
                id: 'cat-1',
            } as unknown as Awaited<ReturnType<typeof repository.catalog.refreshCatalogSeasons>>);

            cacheService.set('catalog:leagues:by-id:cat-1', [{ stale: true }], 60_000);

            const result = await fire(
                `mutation { refreshCatalogSeasons(catalogId: "cat-1") { id } }`,
            );
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('catalog:leagues:by-id:cat-1')).toBeUndefined();
        });

        it('updateSeasonConfig invalidates the `seasons` cache', async () => {
            vi.mocked(repository.leagues.updateSeasonConfig).mockResolvedValue({
                id: 's1',
                year: 2024,
            } as unknown as typeof schema.seasons.$inferSelect);

            cacheService.set('seasons:all', [{ stale: true }], 60_000);

            const result = await fire(
                `mutation { updateSeasonConfig(seasonId: "s1", configJson: "{}") { id } }`,
            );
            expect(result.errors).toBeUndefined();
            expect(cacheService.get('seasons:all')).toBeUndefined();
        });
    });

    describe('prefix-isolation regression guards', () => {
        it('saveLeagueConfig does not invalidate `seasons:*` keys', async () => {
            vi.mocked(repository.leagues.updateLeagueConfig).mockResolvedValue({
                id: 'l1',
            } as unknown as typeof schema.leagues.$inferSelect);

            cacheService.set('seasons:all', [{ stable: true }], 60_000);
            cacheService.set('seasons:by-league:l1', [{ stable: true }], 60_000);

            await fire(`mutation { saveLeagueConfig(id: "l1", configJson: "{}") { id } }`);

            expect(cacheService.get('seasons:all')).toEqual([{ stable: true }]);
            expect(cacheService.get('seasons:by-league:l1')).toEqual([{ stable: true }]);
        });

    });
});
