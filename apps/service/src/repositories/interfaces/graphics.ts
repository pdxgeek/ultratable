import * as schema from '../../db/schema';

export interface GraphicsRepository {
    getGraphics(entityType: string, entityId?: string): Promise<Array<typeof schema.graphics.$inferSelect>>;
    saveGraphic(graphic: { entityType: string, entityId: string, variantName?: string, blobPath: string, mimeType?: string, metadata?: Record<string, unknown> }): Promise<typeof schema.graphics.$inferSelect>;
}
