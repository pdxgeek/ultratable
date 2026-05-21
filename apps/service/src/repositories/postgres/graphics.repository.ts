import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { GraphicsRepository } from '../graphics';

export class PostgresGraphicsRepository implements GraphicsRepository {
    async getGraphics(entityType: string, entityId?: string): Promise<Array<typeof schema.graphics.$inferSelect>> {
        if (!db) return [];
        const conditions = [eq(schema.graphics.entityType, entityType)];
        if (entityId) conditions.push(eq(schema.graphics.entityId, entityId));
        return db.select().from(schema.graphics).where(and(...conditions));
    }

    async saveGraphic(graphic: Record<string, unknown>): Promise<typeof schema.graphics.$inferSelect> {
        if (!db) return null as unknown as typeof schema.graphics.$inferSelect;
        const [upserted] = await db.insert(schema.graphics)
            .values({ ...graphic, updatedAt: new Date() } as unknown as typeof schema.graphics.$inferInsert)
            .onConflictDoUpdate({
                target: [schema.graphics.entityType, schema.graphics.entityId],
                set: {
                    blobPath: sql`excluded.blob_path`,
                    mimeType: sql`excluded.mime_type`,
                    metadata: sql`excluded.metadata`,
                    updatedAt: new Date()
                }
            })
            .returning();
        return upserted;
    }
}
