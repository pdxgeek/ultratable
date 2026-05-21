import 'dotenv/config';

import { readFileSync } from 'fs';

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

// Read the journal to get all migration entries
const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf-8'));

async function run() {
    // Ensure the drizzle schema and migrations table exist
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
            id serial PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        )
    `);

    // Check what's already tracked
    const existing = await sql.unsafe<{ hash: string }[]>(
        `SELECT hash FROM drizzle.__drizzle_migrations`,
    );
    const existingHashes = new Set(existing.map((r) => r.hash));

    let seeded = 0;
    for (const entry of journal.entries) {
        // Read the SQL file to compute a consistent hash (drizzle uses the tag as hash)
        const tag = entry.tag;
        if (existingHashes.has(tag)) {
            console.log(`  ✓ ${tag} (already tracked)`);
            continue;
        }
        await sql.unsafe(
            `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
            [tag, entry.when],
        );
        console.log(`  + ${tag} (seeded)`);
        seeded++;
    }
    console.log(`\n✅ Seeded ${seeded} migration entries (${existing.length} already tracked)`);
    await sql.end();
}

run().catch((e) => {
    console.error('Failed:', e.message);
    process.exit(1);
});
