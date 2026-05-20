import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from './supabase.repository';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

describe('SupabaseFootballRepository - Formula & Graphics', () => {
    const testFormula = {
        id: 'test-pts',
        name: 'Test Points',
        description: 'Standard 3/1/0 points',
        logicType: 'standard'
    };

    const testGraphic = {
        entityType: 'team',
        entityId: '00000000-0000-0000-0000-000000000001',
        variantName: 'default',
        blobPath: 'gfx/blobs/test-hash.png',
        mimeType: 'image/png',
        metadata: { width: 100, height: 100 }
    };

    beforeEach(async () => {
        if (!db) return;
        // Clean up test data
        await db.delete(schema.graphics).where(eq(schema.graphics.blobPath, testGraphic.blobPath));
        await db.delete(schema.rankingFormulas).where(eq(schema.rankingFormulas.id, testFormula.id));
    });

    it('should save and retrieve ranking formulas', async () => {
        if (!db) return;
        const saved = await repository.football.saveRankingFormula(testFormula);
        expect(saved.id).toBe(testFormula.id);
        expect(saved.name).toBe(testFormula.name);

        const all = await repository.football.getRankingFormulas();
        expect(all.some(f => f.id === testFormula.id)).toBe(true);
    });

    it('should save and retrieve graphics', async () => {
        if (!db) return;
        const saved = await repository.football.saveGraphic(testGraphic);
        expect(saved.blobPath).toBe(testGraphic.blobPath);
        expect(saved.entityId).toBe(testGraphic.entityId);

        const results = await repository.football.getGraphics(testGraphic.entityType, testGraphic.entityId);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].blobPath).toBe(testGraphic.blobPath);
    });

    it('should upsert graphics on conflict', async () => {
        if (!db) return;
        await repository.football.saveGraphic(testGraphic);

        const updatedGraphic = { ...testGraphic, mimeType: 'image/jpeg' };
        const updated = await repository.football.saveGraphic(updatedGraphic);

        expect(updated.mimeType).toBe('image/jpeg');

        const results = await repository.football.getGraphics(testGraphic.entityType, testGraphic.entityId);
        expect(results.length).toBe(1);
    });

    describe('Delta Sync (updatedAt filtering)', () => {
        it('should filter fixtures by updatedAt', async () => {
            if (!db) return;
            const anySeason = await db.select().from(schema.seasons).limit(1);
            if (anySeason.length === 0) return;

            const league = await db.select().from(schema.leagues).where(eq(schema.leagues.id, anySeason[0].leagueId));
            if (league.length === 0) return;

            const leagueSourceId = league[0].sourceId;
            const season = anySeason[0].year;

            const fixtures = await repository.football.getFixtures(leagueSourceId, season);
            if (fixtures.length === 0) return; // Skip if no data

            const midPoint = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
            const recent = await repository.football.getFixtures(leagueSourceId, season, midPoint);

            recent.forEach(f => {
                expect(new Date(f.updatedAt).getTime()).toBeGreaterThan(midPoint.getTime());
            });
        });

        it('should filter teams by updatedAt', async () => {
            if (!db) return;
            const anySeason = await db.select().from(schema.seasons).limit(1);
            if (anySeason.length === 0) return;

            const league = await db.select().from(schema.leagues).where(eq(schema.leagues.id, anySeason[0].leagueId));
            if (league.length === 0) return;

            const leagueSourceId = league[0].sourceId;
            const season = anySeason[0].year;

            let teams;
            try {
                teams = await repository.football.getTeams(leagueSourceId, season);
            } catch (e) {
                return; // Skip if league/season not found
            }
            if (!teams || teams.length === 0) return;

            const midPoint = new Date(Date.now() - 1000 * 60 * 60);
            const recent = await repository.football.getTeams(leagueSourceId, season, midPoint);

            recent.forEach(t => {
                expect(new Date(t.updatedAt).getTime()).toBeGreaterThan(midPoint.getTime());
            });
        });
    });
});
