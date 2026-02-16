import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { database } from './db';
import { db } from './dao/schema';
import type { Fixture, Team, LeagueConfig } from '../types';

describe('UltraTableDatabase', () => {
    beforeEach(async () => {
        // Clear all tables before each test
        await db.cache.clear();
        await db.blobs.clear();
        await db.quotas.clear();
        await db.leagues.clear();
        await db.settings.clear();
        await db.logs.clear();
    });

    afterEach(async () => {
        // Clean up after tests
        await database.clearAllCache();
    });

    describe('Fixtures', () => {
        it('should save and retrieve fixtures', async () => {
            const fixtures: Fixture[] = [
                {
                    id: '1',
                    integrationId: 'mock:1',
                    commonName: 'Test Match',
                    homeTeamId: '100',
                    awayTeamId: '101',
                    homeTeam: { name: 'Team A', logo: '', winner: null },
                    awayTeam: { name: 'Team B', logo: '', winner: null },
                    date: '2024-01-01',
                    timestamp: Date.now(),
                    status: 'NS',
                    venue: 'Stadium A',
                    round: 'Round 1',
                    goalsHome: null,
                    goalsAway: null,
                    events: [],
                    lineups: { home: null, away: null },
                    eventsLoaded: false,
                },
            ];

            await database.saveFixtures(39, 2024, fixtures);
            const retrieved = await database.getFixtures(39, 2024);

            expect(retrieved).toEqual(fixtures);
        });

        it('should return null for non-existent fixtures', async () => {
            const result = await database.getFixtures(999, 2024);
            expect(result).toBeNull();
        });

        it('should get fixtures age', async () => {
            const fixtures: Fixture[] = [];
            await database.saveFixtures(39, 2024, fixtures);

            const age = await database.getFixturesAge(39, 2024);
            expect(age).toBeGreaterThanOrEqual(0);
            expect(age).toBeLessThan(1000); // Should be very recent
        });
    });

    describe('Teams', () => {
        it('should save and retrieve teams', async () => {
            const teams: Team[] = [
                {
                    id: '100',
                    integrationId: 'mock:100',
                    commonName: 'Test Team',
                    shortCode: 'TST',
                    venue: 'Stadium',
                    venueImage: '',
                    city: 'Test City',
                    logo: 'https://example.com/logo.png',
                    founded: 2000,
                },
            ];

            await database.saveTeams(39, 2024, teams);
            const retrieved = await database.getTeams(39, 2024);

            expect(retrieved).toEqual(teams);
        });
    });

    describe('Graphics', () => {
        it('should save and retrieve graphic blobs', async () => {
            const blob = new Blob(['test data'], { type: 'image/png' });
            const graphicId = 'test_graphic_123';

            await database.saveGraphicBlob(graphicId, blob);
            const retrieved = await database.getGraphicBlob(graphicId);

            expect(retrieved).toBeTruthy();
            expect(retrieved).toHaveProperty('type', 'image/png');
        });

        it.skip('should generate blob URLs', async () => {
            // Skipped: fake-indexeddb doesn't properly support URL.createObjectURL
            const blob = new Blob(['test data'], { type: 'image/png' });
            const graphicId = 'test_graphic_456';

            await database.saveGraphicBlob(graphicId, blob);
            const blobUrl = await database.getGraphicBlobUrl(graphicId);

            expect(blobUrl).toBeTruthy();
            expect(typeof blobUrl).toBe('string');
        });

        it('should delete graphics', async () => {
            const blob = new Blob(['test data'], { type: 'image/png' });
            const graphicId = 'test_graphic_789';

            await database.saveGraphicBlob(graphicId, blob);
            await database.deleteGraphic(graphicId);
            const retrieved = await database.getGraphicBlob(graphicId);

            expect(retrieved).toBeNull();
        });

        it('should clear all graphics', async () => {
            const blob1 = new Blob(['data1'], { type: 'image/png' });
            const blob2 = new Blob(['data2'], { type: 'image/png' });

            await database.saveGraphicBlob('graphic1', blob1);
            await database.saveGraphicBlob('graphic2', blob2);
            await database.clearAllGraphics();

            const g1 = await database.getGraphicBlob('graphic1');
            const g2 = await database.getGraphicBlob('graphic2');

            expect(g1).toBeNull();
            expect(g2).toBeNull();
        });
    });

    describe('Quotas', () => {
        it('should increment quota and track usage', async () => {
            const endpoint = 'test-endpoint';
            const limit = 10;

            const result1 = await database.incrementQuota(endpoint, limit);
            expect(result1).toBe(true);

            const status = await database.getQuotaStatus(endpoint);
            expect(status?.used).toBe(1);
            expect(status?.limit).toBe(10);
            expect(status?.remaining).toBe(9);
        });

        it('should reject when quota exceeded', async () => {
            const endpoint = 'limited-endpoint';
            const limit = 2;

            await database.incrementQuota(endpoint, limit);
            await database.incrementQuota(endpoint, limit);
            const result = await database.incrementQuota(endpoint, limit);

            expect(result).toBe(false);

            const status = await database.getQuotaStatus(endpoint);
            expect(status?.used).toBe(2);
            expect(status?.remaining).toBe(0);
        });

        it('should reset quota', async () => {
            const endpoint = 'reset-test';
            await database.incrementQuota(endpoint, 10);
            await database.resetQuota(endpoint);

            const status = await database.getQuotaStatus(endpoint);
            expect(status).toBeNull();
        });
    });

    describe('Leagues', () => {
        it('should save and retrieve league config', async () => {
            const config: LeagueConfig = {
                id: 39,
                name: 'Premier League',
                season: 2024,
                matchesPerSeason: 380,
                rules: {
                    promotionSlots: 0,
                    playoffStart: 0,
                    playoffEnd: 0,
                    relegationStart: 18,
                    pointsForWin: 3,
                    pointsForDraw: 1,
                    pointsForLoss: 0,
                },
                integrations: {
                    fixtures: 'api-football',
                    standings: 'api-football',
                    basicTeamInfo: 'api-football',
                },
            };

            await database.saveLeague(config);
            const retrieved = await database.getLeague(39, 2024);

            expect(retrieved).toEqual(config);
        });

        it('should get all leagues', async () => {
            const config1: LeagueConfig = {
                id: 39,
                name: 'Premier League',
                season: 2024,
                matchesPerSeason: 380,
                rules: {
                    promotionSlots: 0,
                    playoffStart: 0,
                    playoffEnd: 0,
                    relegationStart: 18,
                    pointsForWin: 3,
                    pointsForDraw: 1,
                    pointsForLoss: 0,
                },
            };

            const config2: LeagueConfig = {
                id: 140,
                name: 'La Liga',
                season: 2024,
                matchesPerSeason: 380,
                rules: {
                    promotionSlots: 0,
                    playoffStart: 0,
                    playoffEnd: 0,
                    relegationStart: 18,
                    pointsForWin: 3,
                    pointsForDraw: 1,
                    pointsForLoss: 0,
                },
            };

            await database.saveLeague(config1);
            await database.saveLeague(config2);

            const allLeagues = await database.getAllLeagues();
            expect(Object.keys(allLeagues).length).toBe(2);
            expect(allLeagues['39_2024']).toEqual(config1);
            expect(allLeagues['140_2024']).toEqual(config2);
        });

        it('should delete league', async () => {
            const config: LeagueConfig = {
                id: 39,
                name: 'Test League',
                season: 2024,
                matchesPerSeason: 380,
                rules: {
                    promotionSlots: 0,
                    playoffStart: 0,
                    playoffEnd: 0,
                    relegationStart: 18,
                    pointsForWin: 3,
                    pointsForDraw: 1,
                    pointsForLoss: 0,
                },
            };

            await database.saveLeague(config);
            await database.deleteLeague(39, 2024);
            const retrieved = await database.getLeague(39, 2024);

            expect(retrieved).toBeNull();
        });
    });

    describe('Settings', () => {
        it('should save and retrieve settings', async () => {
            const settings = {
                theme: 'dark',
                showZones: true,
                showForm: true,
            };

            await database.saveSettings(settings);
            const retrieved = await database.getSettings();

            expect(retrieved).toEqual(settings);
        });
    });

    describe('Logs', () => {
        it('should add and retrieve logs', async () => {
            await database.addLog('info', 'Test log message');
            await database.addLog('error', 'Error message', { code: 500 });

            const logs = await database.getLogs(10);

            expect(logs.length).toBe(2);
            expect(logs[0].message).toBe('Error message'); // Most recent first
            expect(logs[0].level).toBe('error');
            expect(logs[0].context).toEqual({ code: 500 });
            expect(logs[1].message).toBe('Test log message');
        });

        it('should limit number of logs returned', async () => {
            for (let i = 0; i < 10; i++) {
                await database.addLog('info', `Log ${i}`);
            }

            const logs = await database.getLogs(5);
            expect(logs.length).toBe(5);
        });

        it('should clear logs', async () => {
            await database.addLog('info', 'Test');
            await database.clearLogs();

            const logs = await database.getLogs();
            expect(logs.length).toBe(0);
        });
    });

    describe('Generic Cache', () => {
        it('should cache arbitrary data', async () => {
            const data = { foo: 'bar', baz: 123 };
            await database.saveCached('test_key', data);

            const retrieved = await database.getCached('test_key');
            expect(retrieved?.data).toEqual(data);
        });

        it('should get cache age', async () => {
            await database.saveCached('test_key', 'value');
            const age = await database.getCacheAge('test_key');

            expect(age).toBeGreaterThanOrEqual(0);
            expect(age).toBeLessThan(1000);
        });

        it('should delete cached item', async () => {
            await database.saveCached('test_key', 'value');
            await database.deleteCached('test_key');

            const retrieved = await database.getCached('test_key');
            expect(retrieved).toBeNull();
        });
    });

    describe('Bulk Operations', () => {
        it('should clear all cache', async () => {
            await database.saveFixtures(39, 2024, []);
            await database.saveTeams(39, 2024, []);
            await database.saveGraphicBlob('test', new Blob(['data']));
            await database.addLog('info', 'Test');

            await database.clearAllCache();

            const fixtures = await database.getFixtures(39, 2024);
            const teams = await database.getTeams(39, 2024);
            const graphic = await database.getGraphicBlob('test');
            const logs = await database.getLogs();

            expect(fixtures).toBeNull();
            expect(teams).toBeNull();
            expect(graphic).toBeNull();
            expect(logs.length).toBe(0);
        });
    });
});
