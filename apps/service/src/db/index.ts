import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import * as schema from './schema';
import * as dotenv from 'dotenv';
import path from 'path';
import { isSupabaseMode } from '../config/runtime-mode';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbUrl = process.env.DATABASE_URL;

// Note: globalLogger imports db, so we can't use the Pino logger here without a cycle.
// Write directly to stderr — the warning only fires when DATABASE_URL is missing,
// at which point the logger's DB stream can't function anyway.
if (!dbUrl) {
    process.stderr.write('⚠️ DATABASE_URL is not set. Database operations will fail until configured.\n');
}

// Relational DB client (Drizzle)
const pgClient = dbUrl
    ? postgres(dbUrl, {
        max: 10,
        idle_timeout: 30,
        connect_timeout: 10,
    })
    : null;

export const db = pgClient
    ? drizzle(pgClient, { schema })
    : (null as unknown as ReturnType<typeof drizzle>);

// Supabase "Full Stack" Client — only constructed in supabase runtime mode.
export const supabase = (isSupabaseMode() && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false }
    })
    : (null as unknown as ReturnType<typeof createClient>);
