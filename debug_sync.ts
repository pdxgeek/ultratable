
import 'dotenv/config';
import { SupabaseFootballRepository } from './apps/service/src/repositories/supabase.repository';

async function run() {
    const repo = new SupabaseFootballRepository();
    try {
        console.log("Running syncFixtures(39, 2024)...");
        const result = await repo.syncFixtures(39, 2024);
        console.log("Success! Processed:", result.stats.processedCount);
    } catch (err) {
        console.error("FAILED with error:");
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
