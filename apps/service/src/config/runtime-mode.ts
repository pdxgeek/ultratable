import path from 'path';

import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export type RuntimeMode = 'supabase' | 'docker' | 'system';

function resolveRuntimeMode(): RuntimeMode {
    const explicit = process.env.DB_MODE?.trim().toLowerCase();
    if (explicit === 'supabase' || explicit === 'docker' || explicit === 'system') {
        return explicit;
    }
    // Legacy fallback for envs written before DB_MODE was a real variable:
    // a populated SUPABASE_URL implied Supabase mode.
    if (process.env.SUPABASE_URL?.trim()) return 'supabase';
    return 'system';
}

export const runtimeMode: RuntimeMode = resolveRuntimeMode();

export function isSupabaseMode(): boolean {
    return runtimeMode === 'supabase';
}
