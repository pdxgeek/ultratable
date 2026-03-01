import { SupabaseFootballRepository } from './src/repositories/supabase.repository';

async function main() {
    try {
        const repo = new SupabaseFootballRepository();

        console.log("Fetching fixtures...");
        const res = await repo.getFixtures(40, 2025);

        console.log("Length returned:", res.length);
    } catch (e) { console.error(e); }
    process.exit(0);
}
main();
