import { db } from '../db';
import * as schema from '../db/schema';
import { repository } from '../repositories/supabase.repository';
import { eq } from 'drizzle-orm';

async function run() {
    try {
        console.log('--- Database Reset ---');
        console.log('1. Clearing existing managed data...');
        // Order matters for FKs
        await db.delete(schema.fixtures);
        await db.delete(schema.standingsRows);
        await db.delete(schema.seasons);
        await db.delete(schema.teams);
        await db.delete(schema.leagues);
        console.log('✅ Managed data cleared.');

        console.log('\n--- Catalog Sync ---');
        console.log('2. Syncing Catalog (Countries + Leagues)...');
        const syncResult = await repository.football.syncCatalogLeagues();
        console.log(`✅ Catalog sync complete. Processed ${syncResult.stats.processedCount} leagues across ${syncResult.stats.apiCallsCount} API calls.`);

        console.log('\n--- League Promotion ---');
        console.log('3. Finding and Promoting Championship (SourceId 40)...');
        const [catLeague] = await db.select()
            .from(schema.catalogLeagues)
            .where(eq(schema.catalogLeagues.sourceId, 40));

        if (!catLeague) {
            throw new Error('Championship (League 40) not found in the catalog. Was sync successful?');
        }

        const managed = await repository.football.promoteLeague(catLeague.id);
        console.log(`✅ Promoted League: ${managed.name} (Local ID: ${managed.id})`);

        console.log('\n--- Fixture Seeding ---');
        console.log('4. Seeding Championship Fixtures for 2024...');
        const fixturesResult = await repository.football.syncFixtures(40, 2024);
        console.log(`✅ Seeding Complete. Processed ${fixturesResult.stats.processedCount} fixtures.`);

    } catch (error: any) {
        console.error('\n❌ SEEDING FAILED:');
        console.error(error.message || error);
        if (error.stack) console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

run();
