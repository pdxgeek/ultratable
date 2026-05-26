/**
 * Type-checked IRepository test double.
 *
 * The earlier `vi.mock('../repositories', () => ({ repository: { leagues: {...} } }))`
 * pattern silently lost type information — adding a method to IRepository or
 * changing a signature would not break tests until runtime. This factory builds
 * a stub that:
 *
 *   1. Satisfies the full IRepository interface (TypeScript catches drift).
 *   2. Sets every method to a `vi.fn()` returning a sensible empty default.
 *   3. Accepts a `Partial<IRepository>` override so each test wires up only
 *      what it needs to assert.
 *
 * If a new method is added to IRepository and not added here, this file fails
 * to compile — that is intentional.
 */
import type { CatalogRepository } from '../catalog';
import type { ConfigRepository } from '../config';
import type { FixturesRepository } from '../fixtures';
import type { GameweekPredictionsRepository } from '../gameweek-predictions';
import type { GraphicsRepository } from '../graphics';
import type { LeaguesRepository } from '../leagues';
import type { PlayersRepository } from '../players';
import type { PredictionsRepository } from '../predictions';
import type { IRepository } from '../repository';
import type { TeamsRepository } from '../teams';
import type { TierListsRepository } from '../tier-lists';
import type { UsersRepository } from '../users';
import type { WorkersRepository } from '../workers';

import { vi } from 'vitest';

export function buildMockLeagues(overrides: Partial<LeaguesRepository> = {}): LeaguesRepository {
    return {
        getLeagues: vi.fn().mockResolvedValue([]),
        getLeagueById: vi.fn().mockResolvedValue(null),
        getLeaguesByIds: vi.fn().mockResolvedValue([]),
        updateLeagueConfig: vi.fn().mockResolvedValue(null),
        getInternalSeasons: vi.fn().mockResolvedValue([]),
        getAllInternalSeasons: vi.fn().mockResolvedValue([]),
        getSeasonsByIds: vi.fn().mockResolvedValue([]),
        getSeasonIdsWithTeamLinks: vi.fn().mockResolvedValue([]),
        syncSeasons: vi
            .fn()
            .mockResolvedValue({ data: [], stats: { processedCount: 0, apiCallsCount: 0 } }),
        importSeason: vi.fn().mockResolvedValue(null),
        updateSeasonConfig: vi.fn().mockResolvedValue(null),
        removeSeason: vi.fn().mockResolvedValue(true),
        getRankingFormulas: vi.fn().mockResolvedValue([]),
        saveRankingFormula: vi.fn().mockResolvedValue(null),
        ...overrides,
    };
}

export function buildMockTeams(overrides: Partial<TeamsRepository> = {}): TeamsRepository {
    return {
        getTeams: vi.fn().mockResolvedValue([]),
        getAllTeams: vi.fn().mockResolvedValue([]),
        getTeamById: vi.fn().mockResolvedValue(null),
        getTeamsByIds: vi.fn().mockResolvedValue([]),
        getTeamIdsBySourceIds: vi.fn().mockResolvedValue(new Map()),
        getTeamsBySeasonId: vi.fn().mockResolvedValue([]),
        countTeamsInSeason: vi.fn().mockResolvedValue(0),
        syncTeams: vi.fn().mockResolvedValue([]),
        getVenueById: vi.fn().mockResolvedValue(null),
        getVenuesByIds: vi.fn().mockResolvedValue([]),
        getVenuesBySeasonId: vi.fn().mockResolvedValue([]),
        upsertVenues: vi.fn().mockResolvedValue(undefined),
        importSquad: vi.fn().mockResolvedValue([]),
        getTeamRoster: vi.fn().mockResolvedValue([]),
        ...overrides,
    };
}

export function buildMockFixtures(overrides: Partial<FixturesRepository> = {}): FixturesRepository {
    return {
        getFixtures: vi.fn().mockResolvedValue([]),
        getFixtureById: vi.fn().mockResolvedValue(null),
        getFixturesBySeasonId: vi.fn().mockResolvedValue([]),
        countFixturesInSeason: vi.fn().mockResolvedValue(0),
        getFixturesByGameweek: vi.fn().mockResolvedValue([]),
        getRecommendedRescheduledFixtures: vi.fn().mockResolvedValue([]),
        listSelectableGameweeks: vi.fn().mockResolvedValue([]),
        getActiveGameweek: vi.fn().mockResolvedValue(null),
        syncFixtures: vi
            .fn()
            .mockResolvedValue({ data: [], stats: { processedCount: 0, apiCallsCount: 0 } }),
        getMatchEvents: vi.fn().mockResolvedValue([]),
        getLineups: vi.fn().mockResolvedValue([]),
        ...overrides,
    };
}

export function buildMockCatalog(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
    return {
        syncCatalogCountries: vi
            .fn()
            .mockResolvedValue({ data: [], stats: { processedCount: 0, apiCallsCount: 0 } }),
        syncCatalogLeagues: vi
            .fn()
            .mockResolvedValue({ data: [], stats: { processedCount: 0, apiCallsCount: 0 } }),
        getCatalogCountries: vi.fn().mockResolvedValue([]),
        getCatalogLeagues: vi.fn().mockResolvedValue([]),
        refreshCatalogSeasons: vi.fn().mockResolvedValue(null),
        promoteLeague: vi.fn().mockResolvedValue(null),
        ...overrides,
    };
}

export function buildMockPlayers(overrides: Partial<PlayersRepository> = {}): PlayersRepository {
    return {
        getPlayerById: vi.fn().mockResolvedValue(null),
        getPlayerData: vi.fn().mockResolvedValue(null),
        resolvePlayerBySourceId: vi.fn().mockResolvedValue(null),
        ...overrides,
    };
}

export function buildMockGraphics(overrides: Partial<GraphicsRepository> = {}): GraphicsRepository {
    return {
        getGraphics: vi.fn().mockResolvedValue([]),
        saveGraphic: vi.fn().mockResolvedValue(null),
        ...overrides,
    };
}

export function buildMockConfig(overrides: Partial<ConfigRepository> = {}): ConfigRepository {
    return {
        getDatabaseUrlMasked: vi.fn().mockResolvedValue(null),
        getApiFootballKeyMasked: vi.fn().mockResolvedValue(null),
        getSupabaseUrl: vi.fn().mockResolvedValue(null),
        getSupabaseAnonKeyMasked: vi.fn().mockResolvedValue(null),
        updateDatabaseUrl: vi.fn().mockResolvedValue(true),
        updateApiFootballKey: vi.fn().mockResolvedValue(true),
        updateSupabaseConfig: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

export function buildMockWorkers(overrides: Partial<WorkersRepository> = {}): WorkersRepository {
    return {
        listJobs: vi.fn().mockResolvedValue([]),
        getJobByName: vi.fn().mockResolvedValue(null),
        listJobExecutions: vi.fn().mockResolvedValue([]),
        getLatestJobExecution: vi.fn().mockResolvedValue(null),
        listSystemLogs: vi.fn().mockResolvedValue([]),
        ...overrides,
    };
}

export function buildMockUsers(overrides: Partial<UsersRepository> = {}): UsersRepository {
    return {
        getDomainUserById: vi.fn().mockResolvedValue(null),
        getIdentitiesForDomainUser: vi.fn().mockResolvedValue([]),
        setDomainUserRoles: vi.fn().mockResolvedValue(null),
        updateDomainUserProfile: vi.fn().mockResolvedValue(null),
        getFollowedLeagueIds: vi.fn().mockResolvedValue([]),
        setFollowedLeagueIds: vi.fn().mockResolvedValue([]),
        deleteDomainUser: vi
            .fn()
            .mockImplementation(async (id: string) => ({
                deletedDomainUserId: id,
                deletedAuthUserIds: [],
            })),
        ...overrides,
    };
}

export function buildMockPredictions(
    overrides: Partial<PredictionsRepository> = {},
): PredictionsRepository {
    return {
        createSnapshot: vi.fn().mockResolvedValue({
            id: 'snap-1',
            userId: 'user-1',
            seasonId: 'season-1',
            type: 'projected_finish',
            lockedAt: new Date(),
            deletedAt: null,
        }),
        listSnapshots: vi.fn().mockResolvedValue([]),
        getSnapshotById: vi.fn().mockResolvedValue(null),
        listSnapshotEntries: vi.fn().mockResolvedValue([]),
        listSnapshotEntriesByIds: vi.fn().mockResolvedValue(new Map()),
        softDeleteSnapshot: vi.fn().mockResolvedValue(null),
        countSnapshotsInScope: vi.fn().mockResolvedValue(0),
        countGameweeksInSeason: vi.fn().mockResolvedValue(0),
        ...overrides,
    };
}

export function buildMockGameweekPredictions(
    overrides: Partial<GameweekPredictionsRepository> = {},
): GameweekPredictionsRepository {
    const now = new Date();
    const predictionStub = {
        id: 'gw-pred-1',
        userId: 'user-1',
        seasonId: 'season-1',
        gameweek: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
    const pickStub = {
        id: 'gw-pick-1',
        predictionId: 'gw-pred-1',
        fixtureId: 'fix-1',
        homeGoals: null,
        awayGoals: null,
        note: null,
        manuallyAdded: false,
        createdAt: now,
    };
    return {
        submitPick: vi
            .fn()
            .mockResolvedValue({ prediction: predictionStub, pick: pickStub, deduped: false }),
        listPredictionsForUser: vi.fn().mockResolvedValue([]),
        getPredictionForWeek: vi.fn().mockResolvedValue(null),
        getPredictionById: vi.fn().mockResolvedValue(null),
        softDeletePrediction: vi.fn().mockResolvedValue(null),
        listCurrentPicks: vi.fn().mockResolvedValue([]),
        listPickHistory: vi.fn().mockResolvedValue([]),
        listCurrentPicksByPredictionIds: vi.fn().mockResolvedValue(new Map()),
        listPickHistoryByPredictionIds: vi.fn().mockResolvedValue(new Map()),
        ...overrides,
    };
}

export function buildMockTierLists(
    overrides: Partial<TierListsRepository> = {},
): TierListsRepository {
    const now = new Date();
    const tierListStub = {
        id: 'tier-list-1',
        userId: 'user-1',
        seasonId: 'season-1',
        tierRankableTypeId: 'coach',
        title: 'Mock Tier List',
        tiers: [],
        displayConfig: { showTeamNames: true, showTeamLogos: true },
        isLocked: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
    const coachRow = { id: 'coach', name: 'Coach', defaultFormulaId: null };
    return {
        getTierRankableTypeById: vi.fn().mockResolvedValue(coachRow),
        listTierRankableTypes: vi.fn().mockResolvedValue([coachRow]),
        createTierList: vi.fn().mockResolvedValue(tierListStub),
        listTierLists: vi.fn().mockResolvedValue([]),
        getTierListById: vi.fn().mockResolvedValue(null),
        updateTierListTitle: vi.fn().mockResolvedValue(null),
        updateTierListTiers: vi.fn().mockResolvedValue(null),
        updateTierListDisplayConfig: vi.fn().mockResolvedValue(null),
        setTierListLocked: vi.fn().mockResolvedValue(null),
        softDeleteTierList: vi.fn().mockResolvedValue(null),
        countTierListsInScope: vi.fn().mockResolvedValue(0),
        addTierRankableItem: vi.fn().mockResolvedValue({
            id: 'item-1',
            tierListId: 'tier-list-1',
            tierRankableTypeId: 'coach',
            naturalKey: 'mock-key',
            tierKey: null,
            position: 1,
            name: 'Mock Item',
            imageUrl: null,
            teamId: null,
            sourceType: null,
            sourceId: null,
            sourcePath: null,
            nameOverride: null,
            imageUrlOverride: null,
            subtitle: null,
            addedAt: now,
            deletedAt: null,
        }),
        updateTierRankableItemOverrides: vi.fn().mockResolvedValue(null),
        softDeleteTierRankableItem: vi.fn().mockResolvedValue(null),
        moveTierRankableItem: vi.fn().mockResolvedValue(null),
        listItemsForTierList: vi.fn().mockResolvedValue([]),
        listItemsByTierListIds: vi.fn().mockResolvedValue(new Map()),
        getTierRankableItemById: vi.fn().mockResolvedValue(null),
        countItemsForTierList: vi.fn().mockResolvedValue(0),
        ...overrides,
    };
}

export type RepositoryOverrides = {
    [K in keyof IRepository]?: Partial<IRepository[K]>;
};

function buildMockCoaches(
    overrides: Partial<IRepository['coaches']> = {},
): IRepository['coaches'] {
    return {
        getCoachesBySeasonId: vi.fn().mockResolvedValue([]),
        getCoachByTeamId: vi.fn().mockResolvedValue(null),
        upsertCoach: vi.fn().mockResolvedValue(null),
        getOrSyncCoachForTeam: vi.fn().mockResolvedValue(null),
        ...overrides,
    };
}

export function buildMockRepository(overrides: RepositoryOverrides = {}): IRepository {
    return {
        leagues: buildMockLeagues(overrides.leagues),
        teams: buildMockTeams(overrides.teams),
        fixtures: buildMockFixtures(overrides.fixtures),
        catalog: buildMockCatalog(overrides.catalog),
        players: buildMockPlayers(overrides.players),
        graphics: buildMockGraphics(overrides.graphics),
        config: buildMockConfig(overrides.config),
        workers: buildMockWorkers(overrides.workers),
        users: buildMockUsers(overrides.users),
        predictions: buildMockPredictions(overrides.predictions),
        gameweekPredictions: buildMockGameweekPredictions(overrides.gameweekPredictions),
        tierLists: buildMockTierLists(overrides.tierLists),
        coaches: buildMockCoaches(overrides.coaches),
    };
}
