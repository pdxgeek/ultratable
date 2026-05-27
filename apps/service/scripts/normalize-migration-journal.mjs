#!/usr/bin/env node
// Runs after `drizzle-kit generate`. Ensures the newest journal entry's `when`
// is strictly greater than every prior entry. Drizzle's pg migrator skips any
// entry whose `when` is less than the latest `__drizzle_migrations.created_at`
// in the DB — a silent no-op when journal timestamps regress (see issue #148).
//
// The trap was seeded by entries 0017–0022, which carry hand-mocked far-future
// `when` values (1779800000000 → 1780300000000). Real Date.now() catches up
// around 2026-06-01, but until then every freshly generated migration would
// silently regress. This script rewrites the newest entry forward when needed.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const journalPath = resolve(here, '..', 'drizzle', 'meta', '_journal.json');

const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const entries = journal.entries;
if (!Array.isArray(entries) || entries.length === 0) {
    process.exit(0);
}

const newest = entries[entries.length - 1];
const priorMax = entries.slice(0, -1).reduce((max, e) => (e.when > max ? e.when : max), 0);

if (newest.when > priorMax) {
    process.exit(0);
}

const bumped = priorMax + 1;
console.warn(
    `[normalize-migration-journal] Bumping ${newest.tag}.when ${newest.when} → ${bumped} (prior max was ${priorMax}). ` +
        `Drizzle would otherwise skip this migration silently.`,
);
newest.when = bumped;
writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
