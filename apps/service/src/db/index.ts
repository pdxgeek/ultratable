import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import * as schema from './schema';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.warn('⚠️ DATABASE_URL is not set. Database operations will fail until configured.');
}

// Relational DB client (Drizzle)
export const db = dbUrl
    ? drizzle(postgres(dbUrl), { schema })
    : (null as any);

// Supabase "Full Stack" Client
export const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false }
    })
    : (null as any);
