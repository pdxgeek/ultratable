/**
 * One-off script to reset isCompleted on all active seasons.
 * Run with: npx ts-node src/scripts/reset_season_completed.ts
 */
import 'dotenv/config';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    const seasons = await db.select().from(schema.seasons).where(eq(schema.seasons.isCompleted, true));
    console.log(`Found ${seasons.length} completed seasons:`);
    for (const s of seasons) {
        const league = await db.select().from(schema.leagues).where(eq(schema.leagues.id, s.leagueId));
        console.log(`  ${league[0]?.name} ${s.year} (id=${s.id}) — isCompleted=true`);
    }

    if (seasons.length === 0) {
        console.log('No completed seasons to reset.');
        return;
    }

    for (const s of seasons) {
        await db.update(schema.seasons)
            .set({ isCompleted: false, lastLiveSyncAt: null })
            .where(eq(schema.seasons.id, s.id));
        console.log(`  ✅ Reset season ${s.year} (${s.id})`);
    }

    console.log('Done. Live polling will resume on next getFixtures call.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
