/**
 * Tier-lists repository — integration coverage (issue #112).
 *
 * Hits the local Postgres (the `ultratable-postgres-1` container configured
 * via `DATABASE_URL`). Run via `npm run test:integration --workspace apps/service`.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../db';
import * as schema from '../db/schema';
import { repository } from '.';

const TEST_SOURCE = 'test-tier-lists-integration';
const TEST_SOURCE_ID_BASE = 9_920_000;

interface Scaffold {
    user: typeof schema.users.$inferSelect;
    league: typeof schema.leagues.$inferSelect;
    season: typeof schema.seasons.$inferSelect;
    teamA: typeof schema.teams.$inferSelect;
    teamB: typeof schema.teams.$inferSelect;
}

async function deleteTestRows() {
    await db.delete(schema.tierRankableItems).where(sql`
        tier_list_id IN (
            SELECT tl.id FROM tier_list tl
            INNER JOIN "user" u ON tl.user_id = u.id
            WHERE u.email LIKE 'tier-lists-it-%@test.local'
        )
    `);
    await db.delete(schema.tierLists).where(sql`
        user_id IN (SELECT u.id FROM "user" u WHERE u.email LIKE 'tier-lists-it-%@test.local')
    `);
    await db
        .delete(schema.seasonsToTeams)
        .where(sql`team_id IN (SELECT id FROM teams WHERE source_name = ${TEST_SOURCE})`);
    await db
        .delete(schema.seasons)
        .where(sql`league_id IN (SELECT id FROM leagues WHERE source_name = ${TEST_SOURCE})`);
    await db.delete(schema.teams).where(eq(schema.teams.sourceName, TEST_SOURCE));
    await db.delete(schema.leagues).where(eq(schema.leagues.sourceName, TEST_SOURCE));
    await db.delete(schema.users).where(sql`email LIKE 'tier-lists-it-%@test.local'`);
}

async function buildScaffold(suffix: number): Promise<Scaffold> {
    const base = TEST_SOURCE_ID_BASE + suffix * 100;

    const [user] = await db
        .insert(schema.users)
        .values({
            name: `Tier Lists IT ${suffix}`,
            email: `tier-lists-it-${suffix}@test.local`,
        })
        .returning();

    const [league] = await db
        .insert(schema.leagues)
        .values({
            name: `IT Tier Lists League ${base}`,
            slug: `it-tier-lists-${base}`,
            sourceName: TEST_SOURCE,
            sourceId: base,
        })
        .returning();

    const [season] = await db
        .insert(schema.seasons)
        .values({ leagueId: league.id, year: 9000 + suffix })
        .returning();

    const [teamA] = await db
        .insert(schema.teams)
        .values({ name: `IT TL Team A ${base}`, sourceName: TEST_SOURCE, sourceId: base + 10 })
        .returning();
    const [teamB] = await db
        .insert(schema.teams)
        .values({ name: `IT TL Team B ${base}`, sourceName: TEST_SOURCE, sourceId: base + 11 })
        .returning();
    await db
        .insert(schema.seasonsToTeams)
        .values([
            { seasonId: season.id, teamId: teamA.id },
            { seasonId: season.id, teamId: teamB.id },
        ]);

    return { user, league, season, teamA, teamB };
}

const DEFAULT_TIERS = [
    { key: 'tier-s', name: 'S' },
    { key: 'tier-a', name: 'A' },
    { key: 'tier-b', name: 'B' },
];

describe('PostgresTierListsRepository — integration', () => {
    beforeAll(async () => {
        expect(db, 'DATABASE_URL must be configured to run integration tests').toBeTruthy();
        await deleteTestRows();
    });

    afterAll(async () => {
        await deleteTestRows();
    });

    it('coach recipe is seeded by the migration', async () => {
        const recipe = await repository.tierLists.getTierRankableTypeById('coach');
        expect(recipe?.id).toBe('coach');
        expect(recipe?.name).toBe('Coach');
    });

    it('listTierRankableTypes returns the registry', async () => {
        const rows = await repository.tierLists.listTierRankableTypes();
        expect(rows.find((r) => r.id === 'coach')).toBeDefined();
    });

    it('createTierList persists and FK-validates the recipe', async () => {
        const s = await buildScaffold(1);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id,
            seasonId: s.season.id,
            tierRankableTypeId: 'coach',
            title: 'Best Coaches',
            tiers: DEFAULT_TIERS,
        });
        expect(tl.tierRankableTypeId).toBe('coach');

        await expect(
            repository.tierLists.createTierList({
                userId: s.user.id,
                seasonId: s.season.id,
                tierRankableTypeId: 'bogus-recipe',
                title: 'oops',
                tiers: DEFAULT_TIERS,
            }),
        ).rejects.toBeDefined();
    });

    it('addTierRankableItem persists snapshot + natural_key + source pointer', async () => {
        const s = await buildScaffold(2);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id,
            seasonId: s.season.id,
            tierRankableTypeId: 'coach',
            title: 'pool',
            tiers: DEFAULT_TIERS,
        });
        const it = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id,
            tierRankableTypeId: 'coach',
            naturalKey: `${s.teamA.id}|pep guardiola`,
            name: 'Pep Guardiola',
            imageUrl: 'https://example.com/pep.png',
            teamId: s.teamA.id,
            sourceType: 'fixture',
            sourceId: tl.id,
            sourcePath: { teamSourceId: 50 },
        });
        expect(it.name).toBe('Pep Guardiola');
        expect(it.naturalKey).toBe(`${s.teamA.id}|pep guardiola`);
        expect(it.teamId).toBe(s.teamA.id);
        expect(it.sourceType).toBe('fixture');
        expect(it.sourcePath).toEqual({ teamSourceId: 50 });
        expect(it.position).toBe(1.0);
    });

    it('re-adding the same (tierListId, naturalKey) while live returns the same row (no duplicate)', async () => {
        const s = await buildScaffold(3);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id,
            seasonId: s.season.id,
            tierRankableTypeId: 'coach',
            title: 'dup',
            tiers: DEFAULT_TIERS,
        });
        const naturalKey = `${s.teamA.id}|pep guardiola`;
        const first = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id, tierRankableTypeId: 'coach', naturalKey,
            name: 'Pep Guardiola', imageUrl: null, teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });
        const second = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id, tierRankableTypeId: 'coach', naturalKey,
            name: 'Pep Guardiola', imageUrl: null, teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });
        // Re-running a pool search must not double-insert. Within a list,
        // naturalKey is the dedup contract; the second add is a no-op
        // returning the existing row.
        expect(second.id).toBe(first.id);
        expect(second.naturalKey).toBe(first.naturalKey);

        // Cross-user / cross-list, the same naturalKey IS allowed — the
        // DB has no UNIQUE, and aggregates depend on this collision.
        const s2 = await buildScaffold(31);
        const tl2 = await repository.tierLists.createTierList({
            userId: s2.user.id,
            seasonId: s2.season.id,
            tierRankableTypeId: 'coach',
            title: 'other-user',
            tiers: DEFAULT_TIERS,
        });
        const otherUserSameKey = await repository.tierLists.addTierRankableItem({
            tierListId: tl2.id, tierRankableTypeId: 'coach', naturalKey,
            name: 'Pep Guardiola', imageUrl: null, teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });
        expect(otherUserSameKey.id).not.toBe(first.id);
    });

    it('re-adding a soft-deleted item restores it (clears deletedAt, preserves overrides)', async () => {
        const s = await buildScaffold(32);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id,
            seasonId: s.season.id,
            tierRankableTypeId: 'coach',
            title: 'restore',
            tiers: DEFAULT_TIERS,
        });
        const naturalKey = `${s.teamA.id}|pep guardiola`;
        const first = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id, tierRankableTypeId: 'coach', naturalKey,
            name: 'Pep Guardiola', imageUrl: null, teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });
        // Customise then move into a tier so we can prove overrides
        // survive but tierKey is reset to pool (intentional — re-added
        // items land back in the pool, not in some stale tier).
        await repository.tierLists.updateTierRankableItemOverrides({
            itemId: first.id,
            nameOverride: 'The Boss',
            subtitle: 'Manager',
        });
        await repository.tierLists.moveTierRankableItem({
            itemId: first.id,
            tierKey: 'tier-s',
            position: 1.0,
        });
        await repository.tierLists.softDeleteTierRankableItem(first.id);

        // Re-search restores
        const restored = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id, tierRankableTypeId: 'coach', naturalKey,
            name: 'Pep Guardiola (refreshed)', imageUrl: 'new.png', teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });
        expect(restored.id).toBe(first.id);
        expect(restored.deletedAt).toBeNull();
        expect(restored.tierKey).toBeNull(); // back in the pool
        // Snapshot fields refreshed from the new input
        expect(restored.name).toBe('Pep Guardiola (refreshed)');
        expect(restored.imageUrl).toBe('new.png');
        // Per-user overrides preserved deliberately
        expect(restored.nameOverride).toBe('The Boss');
        expect(restored.subtitle).toBe('Manager');
    });

    it('createTierList initialises displayConfig + isLocked defaults', async () => {
        const s = await buildScaffold(33);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id,
            seasonId: s.season.id,
            tierRankableTypeId: 'coach',
            title: 'defaults',
            tiers: DEFAULT_TIERS,
        });
        expect(tl.displayConfig).toEqual({ showTeamNames: true });
        expect(tl.isLocked).toBe(false);
    });

    it('updateTierListDisplayConfig + setTierListLocked persist + return the patched row', async () => {
        const s = await buildScaffold(34);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id,
            seasonId: s.season.id,
            tierRankableTypeId: 'coach',
            title: 'config',
            tiers: DEFAULT_TIERS,
        });
        const patched = await repository.tierLists.updateTierListDisplayConfig(tl.id, {
            showTeamNames: false,
        });
        expect(patched?.displayConfig).toEqual({ showTeamNames: false });

        const locked = await repository.tierLists.setTierListLocked(tl.id, true);
        expect(locked?.isLocked).toBe(true);

        const unlocked = await repository.tierLists.setTierListLocked(tl.id, false);
        expect(unlocked?.isLocked).toBe(false);
    });

    it('CHECK rejects partial source pointer', async () => {
        const s = await buildScaffold(4);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'check', tiers: DEFAULT_TIERS,
        });
        let caught: unknown;
        try {
            await db.insert(schema.tierRankableItems).values({
                tierListId: tl.id,
                tierRankableTypeId: 'coach',
                naturalKey: 'invalid|test',
                tierKey: null,
                position: 1.0,
                name: 'invalid',
                sourceType: 'fixture',
                sourceId: null,
            });
        } catch (err) {
            caught = err;
        }
        const cause = (caught as { cause?: { code?: string; constraint_name?: string } }).cause;
        expect(cause?.code).toBe('23514');
        expect(cause?.constraint_name).toBe('tier_rankable_item_source_pointer_check');
    });

    it('updateTierRankableItemOverrides sets and clears overrides distinctly', async () => {
        const s = await buildScaffold(5);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'overrides', tiers: DEFAULT_TIERS,
        });
        const it = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id, tierRankableTypeId: 'coach',
            naturalKey: `${s.teamA.id}|over coach`,
            name: 'Over Coach', imageUrl: 'https://example.com/over.png',
            teamId: s.teamA.id, sourceType: null, sourceId: null, sourcePath: null,
        });
        const updated = await repository.tierLists.updateTierRankableItemOverrides({
            itemId: it.id,
            nameOverride: 'My Coach',
            imageUrlOverride: 'https://example.com/custom.png',
            subtitle: 'My pick',
        });
        expect(updated?.nameOverride).toBe('My Coach');
        expect(updated?.imageUrlOverride).toBe('https://example.com/custom.png');
        expect(updated?.subtitle).toBe('My pick');

        const cleared = await repository.tierLists.updateTierRankableItemOverrides({
            itemId: it.id,
            nameOverride: null,
        });
        expect(cleared?.nameOverride).toBeNull();
        expect(cleared?.imageUrlOverride).toBe('https://example.com/custom.png');
        expect(cleared?.subtitle).toBe('My pick');
    });

    it('moveTierRankableItem handles all four directions', async () => {
        const s = await buildScaffold(6);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'move', tiers: DEFAULT_TIERS,
        });
        const it = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id, tierRankableTypeId: 'coach',
            naturalKey: `${s.teamA.id}|mover`,
            name: 'Mover', imageUrl: null, teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });

        const m1 = await repository.tierLists.moveTierRankableItem({
            itemId: it.id, tierKey: 'tier-s', position: 1.0,
        });
        expect(m1?.tierKey).toBe('tier-s');

        const m2 = await repository.tierLists.moveTierRankableItem({
            itemId: it.id, tierKey: 'tier-a', position: 1.5,
        });
        expect(m2?.tierKey).toBe('tier-a');

        const m3 = await repository.tierLists.moveTierRankableItem({
            itemId: it.id, tierKey: 'tier-a', position: 2.5,
        });
        expect(m3?.position).toBe(2.5);

        const m4 = await repository.tierLists.moveTierRankableItem({
            itemId: it.id, tierKey: null, position: 1.0,
        });
        expect(m4?.tierKey).toBeNull();
    });

    it('updateTierListTiers rebases orphaned items to tierKey=null', async () => {
        const s = await buildScaffold(7);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'rebase', tiers: DEFAULT_TIERS,
        });
        const add = (key: string) =>
            repository.tierLists.addTierRankableItem({
                tierListId: tl.id, tierRankableTypeId: 'coach',
                naturalKey: `${s.teamA.id}|${key}`,
                name: key, imageUrl: null, teamId: s.teamA.id,
                sourceType: null, sourceId: null, sourcePath: null,
            });
        const stayer = await add('stays-in-s');
        const orphan = await add('tier-b-goes-away');
        await repository.tierLists.moveTierRankableItem({ itemId: stayer.id, tierKey: 'tier-s', position: 1.0 });
        await repository.tierLists.moveTierRankableItem({ itemId: orphan.id, tierKey: 'tier-b', position: 1.0 });

        await repository.tierLists.updateTierListTiers(tl.id, [
            { key: 'tier-s', name: 'S' },
            { key: 'tier-a', name: 'A' },
        ]);

        const items = await repository.tierLists.listItemsForTierList(tl.id);
        expect(items.find((i) => i.id === stayer.id)?.tierKey).toBe('tier-s');
        expect(items.find((i) => i.id === orphan.id)?.tierKey).toBeNull();
    });

    it('countTierListsInScope counts soft-deleted (cap-spam guard)', async () => {
        const s = await buildScaffold(8);
        const a = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'a', tiers: DEFAULT_TIERS,
        });
        await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'b', tiers: DEFAULT_TIERS,
        });
        await repository.tierLists.softDeleteTierList(a.id);
        expect(await repository.tierLists.countTierListsInScope({
            userId: s.user.id, seasonId: s.season.id,
        })).toBe(2);
    });

    it('listItemsByTierListIds batches and returns a map', async () => {
        const s = await buildScaffold(9);
        const tl1 = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'one', tiers: DEFAULT_TIERS,
        });
        const tl2 = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'two', tiers: DEFAULT_TIERS,
        });
        await repository.tierLists.addTierRankableItem({
            tierListId: tl1.id, tierRankableTypeId: 'coach',
            naturalKey: `${s.teamA.id}|batch`,
            name: 'batch', imageUrl: null, teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });
        const map = await repository.tierLists.listItemsByTierListIds([tl1.id, tl2.id]);
        expect(map.get(tl1.id)?.length).toBe(1);
        expect(map.get(tl2.id)).toEqual([]);
    });

    it('cascades: deleting the tier list removes its items; recipe row survives', async () => {
        const s = await buildScaffold(10);
        const tl = await repository.tierLists.createTierList({
            userId: s.user.id, seasonId: s.season.id, tierRankableTypeId: 'coach',
            title: 'cascade', tiers: DEFAULT_TIERS,
        });
        const it = await repository.tierLists.addTierRankableItem({
            tierListId: tl.id, tierRankableTypeId: 'coach',
            naturalKey: `${s.teamA.id}|doomed`,
            name: 'doomed', imageUrl: null, teamId: s.teamA.id,
            sourceType: null, sourceId: null, sourcePath: null,
        });

        await db.delete(schema.tierLists).where(eq(schema.tierLists.id, tl.id));

        const items = await db
            .select()
            .from(schema.tierRankableItems)
            .where(eq(schema.tierRankableItems.id, it.id));
        expect(items).toEqual([]);

        const recipe = await repository.tierLists.getTierRankableTypeById('coach');
        expect(recipe?.id).toBe('coach');
    });

    it('teams.getTeamIdsBySourceIds returns a map of teamSourceId → teamId', async () => {
        const s = await buildScaffold(11);
        const map = await repository.teams.getTeamIdsBySourceIds(TEST_SOURCE, [
            s.teamA.sourceId, s.teamB.sourceId, 999_999,
        ]);
        expect(map.get(s.teamA.sourceId)).toBe(s.teamA.id);
        expect(map.get(s.teamB.sourceId)).toBe(s.teamB.id);
        expect(map.has(999_999)).toBe(false);
    });
});
