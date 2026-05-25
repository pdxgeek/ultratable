// Stamps the Drizzle migrations bookkeeping table for a database that was
// originally bootstrapped via `drizzle-kit push`. Push applies the live
// schema diff but never writes to `drizzle.__drizzle_migrations`, which
// makes `migrate.ts` try to replay every migration from 0000 on next run
// and crash on `CREATE TYPE ... already exists`.
//
// This script reads `apps/service/drizzle/meta/_journal.json`, computes
// the same SHA-256 hash drizzle would (over the raw SQL file contents,
// see node_modules/drizzle-orm/migrator.js), and inserts one row per
// entry — only when the table is empty. Idempotent: re-running on a
// stamped DB is a no-op.

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const MIGRATIONS_DIR = path.resolve(__dirname, '../../drizzle');
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta/_journal.json');

interface JournalEntry {
    idx: number;
    when: number;
    tag: string;
}

interface Journal {
    entries: JournalEntry[];
}

const readJournal = (): Journal => {
    const raw = readFileSync(JOURNAL_PATH, 'utf8');
    return JSON.parse(raw) as Journal;
};

const hashMigration = (tag: string): string => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
    return crypto.createHash('sha256').update(sql).digest('hex');
};

const run = async (): Promise<void> => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not defined');
    }

    const sql = postgres(process.env.DATABASE_URL, {
        max: 1,
        onnotice: () => {},
    });

    try {
        await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
        await sql`
            CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            )
        `;

        const existing = await sql<{ count: string }[]>`
            SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations
        `;
        const existingCount = Number(existing[0]?.count ?? '0');

        if (existingCount > 0) {
            console.log(
                `drizzle.__drizzle_migrations already has ${existingCount} row(s) — nothing to do.`,
            );
            return;
        }

        // Guard: stamping is only correct when the schema was applied out-of-band
        // (e.g. via `drizzle-kit push`). On a truly empty DB the migration table
        // is also empty, and stamping would make `db:migrate` silently skip every
        // migration. Probe for a table from migration 0000 to tell the two apart.
        // Exit 0 (not an error) so setup.mjs's `bootstrap && migrate` chain falls
        // through to db:migrate, which will create the schema from scratch.
        const applicationTables = await sql<{ count: string }[]>`
            SELECT COUNT(*)::text AS count
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'leagues'
        `;
        if (Number(applicationTables[0]?.count ?? '0') === 0) {
            console.log(
                'No application tables found — skipping stamp. `db:bootstrap` is only for DBs created via `db:push`; on a fresh DB, `db:migrate` will create the schema from the migration files.',
            );
            return;
        }

        const journal = readJournal();
        if (journal.entries.length === 0) {
            console.log('Journal is empty — nothing to backfill.');
            return;
        }

        console.log(
            `Stamping drizzle.__drizzle_migrations with ${journal.entries.length} entries from the journal...`,
        );

        const rows = journal.entries.map((entry) => ({
            hash: hashMigration(entry.tag),
            created_at: entry.when,
        }));

        await sql`
            INSERT INTO drizzle.__drizzle_migrations ${sql(rows, 'hash', 'created_at')}
        `;

        for (const entry of journal.entries) {
            console.log(`  ✓ ${entry.tag}`);
        }

        console.log('Bootstrap complete. `migrate.ts` is now safe to run.');
    } finally {
        await sql.end();
    }
};

run().catch((err) => {
    console.error('Bootstrap failed!', err);
    process.exit(1);
});
