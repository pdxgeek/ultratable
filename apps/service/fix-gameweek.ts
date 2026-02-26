import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log("Adding gameweek column to fixtures table...");
    try {
        await db.execute(sql`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS gameweek integer;`);
        console.log("Column added successfully.");
    } catch (error) {
        console.error("Failed to add column:", error);
    } finally {
        process.exit(0);
    }
}

main();
