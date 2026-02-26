import { db } from './src/db';
import { sql } from 'drizzle-orm';
import * as schema from './src/db/schema';

async function main() {
    try {
        const fixtures = await db.execute(sql`
            SELECT f.id, f.source_id, f.gameweek, f.status, f.scheduled_at, f.home_goals, f.away_goals, ht.name as home, act.name as away
            FROM fixtures f
            JOIN teams ht ON f.home_team_id = ht.id
            JOIN teams act ON f.away_team_id = act.id
            WHERE (ht.name ILIKE '%Coventry%' AND act.name ILIKE '%Sheffield%')
               OR (ht.name ILIKE '%Sheffield%' AND act.name ILIKE '%Coventry%')
            ORDER BY f.scheduled_at DESC
        `);
        console.log("Fixtures:", fixtures);
    } catch (e) { console.error(e); }
    process.exit(0);
}
main();
