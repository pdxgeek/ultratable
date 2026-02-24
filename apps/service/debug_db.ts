import { db } from './src/db';
import * as schema from './src/db/schema';
import { eq } from 'drizzle-orm';
import 'dotenv/config';

async function debugSeasons() {
    console.log('Testing DB connection...');
    try {
        const leagues = await db.select().from(schema.leagues);
        console.log(`Found ${leagues.length} leagues.`);

        for (const l of leagues) {
            console.log(`Fetching seasons for league: ${l.name} (Source ID: ${l.sourceId})...`);
            const start = Date.now();
            const seasons = await db.select().from(schema.seasons).where(eq(schema.seasons.leagueId, l.id));
            const end = Date.now();
            console.log(`Found ${seasons.length} seasons in ${end - start}ms.`);
        }
    } catch (e) {
        console.error('Error during debug:', e);
    } finally {
        process.exit(0);
    }
}

debugSeasons();
