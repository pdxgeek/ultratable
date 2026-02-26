import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { storageProvider } from '../providers/supabase-storage.provider';

async function run() {
    console.log('Cleaning up invalid player graphic rows...');
    try {
        // Find all player graphics to delete their blobs if necessary
        const badGraphics = await db.select().from(schema.graphics).where(eq(schema.graphics.entityType, 'player'));

        for (const graphic of badGraphics) {
            console.log(`Deleting blob ${graphic.blobPath} for entity ${graphic.entityId}...`);
            // we delete the file from the bucket so we aren't leaking storage
            await storageProvider.delete('graphics', [graphic.blobPath]);
        }

        // Wipe them from the database
        const result = await db.delete(schema.graphics).where(eq(schema.graphics.entityType, 'player')).returning();

        console.log(`Deleted ${result.length} bad graphic rows.`);
        console.log('Cleanup complete.');
    } catch (e: any) {
        console.error('Failed to cleanup:', e.message);
    }
}

run().then(() => process.exit(0));
