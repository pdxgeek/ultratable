import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const result = await db.execute(sql`SELECT count(*) as total, count(gameweek) as with_gw FROM fixtures;`);
        console.log(result);
    } catch (error) {
        console.error("Failed:", error);
    } finally {
        process.exit(0);
    }
}

main();
