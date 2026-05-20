import { db } from '../db';
import * as schema from '../db/schema';
import { repository } from '../repositories/postgres.repository';
import { storageProvider } from '../providers/supabase-storage.provider';
import { eq } from 'drizzle-orm';

async function clearStorage() {
    console.log('\n--- 1. Clearing Storage Bucket ---');
    try {
        const bucket = 'graphics';
        const blobsPrefix = 'blobs';

        console.log(`Listing files in ${bucket}/${blobsPrefix}...`);
        const files = await storageProvider.list(bucket, blobsPrefix);

        if (files.length === 0) {
            console.log('Bucket is already empty (no files found).');
            return;
        }

        console.log(`Found ${files.length} files. Deleting...`);
        // Delete in batches of 100 to avoid limits
        for (let i = 0; i < files.length; i += 100) {
            const batch = files.slice(i, i + 100);
            await storageProvider.delete(bucket, batch);
            console.log(`Deleted batch ${i / 100 + 1} (${batch.length} files)`);
        }

        console.log('✅ Storage bucket cleared.');
    } catch (e: unknown) {
        console.error('Failed to clear storage bucket:', (e as Error).message);
        // Don't throw, allow DB wipe to continue even if storage wipe fails or isn't configured correctly
    }
}

async function run() {
    try {
        console.log('====================================');
        console.log('       WIPE AND RELOAD DATA         ');
        console.log('====================================');

        // 1. Clear Storage
        await clearStorage();

        // 2. Clear Database
        console.log('\n--- 2. Clearing Database ---');
        console.log('Deleting data (order matters for Foreign Keys)...');
        await db.delete(schema.graphics);
        await db.delete(schema.fixtures);
        await db.delete(schema.standingsRows);
        await db.delete(schema.seasonsToTeams);
        await db.delete(schema.players);
        await db.delete(schema.teams); // Teams must be deleted BEFORE venues
        await db.delete(schema.venues);
        await db.delete(schema.seasons);
        await db.delete(schema.leagues);
        console.log('✅ Managed database cleared.');

        // 3. Sync Catalog
        console.log('\n--- 3. Syncing Catalog ---');
        console.log('Fetching latest Countries and Leagues from provider...');
        const syncResult = await repository.football.syncCatalogLeagues();
        console.log(`✅ Catalog sync complete. Processed ${syncResult.stats.processedCount} leagues.`);

        // 4. Promote League
        console.log('\n--- 4. Promoting League ---');
        const LEAGUE_SOURCE_ID = 40; // Championship
        console.log(`Finding and Promoting League (SourceId ${LEAGUE_SOURCE_ID})...`);

        const [catLeague] = await db.select()
            .from(schema.catalogLeagues)
            .where(eq(schema.catalogLeagues.sourceId, LEAGUE_SOURCE_ID));

        if (!catLeague) {
            throw new Error(`League ${LEAGUE_SOURCE_ID} not found in the catalog. Was sync successful?`);
        }

        const managed = await repository.football.promoteLeague(catLeague.id);
        console.log(`✅ Promoted League: ${managed.name}`);

        // 4b. Refresh catalog seasons so the Season Importer has data
        console.log('Refreshing catalog seasons...');
        await repository.football.refreshCatalogSeasons(catLeague.id);
        console.log('✅ Catalog seasons refreshed.');

        // 5. Seed Fixtures (which brings in Teams, Venues, and Graphics)
        console.log('\n--- 5. Seeding Fixtures and Data ---');
        const SEASON_YEAR = 2024;
        console.log(`Seeding fixtures for ${managed.name} ${SEASON_YEAR}...`);
        console.log('(This will also fetch basic teams and their graphics)');
        const fixturesResult = await repository.football.syncFixtures(LEAGUE_SOURCE_ID, SEASON_YEAR);

        console.log(`✅ Seeding Complete. Processed ${fixturesResult.stats.processedCount} fixtures.`);

        console.log('\n====================================');
        console.log('✅ WIPE AND RELOAD FINISHED SUCCESSFULLY');
        console.log('====================================');

    } catch (error: unknown) {
        console.error('\n❌ SCRIPT FAILED:');
        console.error((error as Error).message || error);
        if ((error as Error).stack) console.error((error as Error).stack);
    } finally {
        process.exit(0);
    }
}

run();
