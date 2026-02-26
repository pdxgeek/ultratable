import { builder } from './builder';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, SQL } from 'drizzle-orm';
import { graphicsService } from '../services/graphics.service';
import { storageProvider } from '../providers/supabase-storage.provider';

const GraphicType = builder.objectRef<typeof schema.graphics.$inferSelect>('Graphic');

GraphicType.implement({
    fields: (t) => ({
        id: t.exposeString('id'),
        entityType: t.exposeString('entityType'),
        entityId: t.exposeString('entityId'),
        sourceUrl: t.exposeString('sourceUrl', { nullable: true }),
        blobPath: t.exposeString('blobPath'),
        mimeType: t.exposeString('mimeType'),
        metadata: t.expose('metadata', { type: 'JSON', nullable: true }),
        url: t.string({
            resolve: (graphic) => storageProvider.getPublicUrl('graphics', graphic.blobPath)
        }),
        createdAt: t.expose('createdAt', { type: 'DateTime' }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' })
    })
});

builder.queryFields((t) => ({
    graphics: t.field({
        type: [GraphicType],
        args: {
            entityType: t.arg.string({ required: true }),
            entityId: t.arg.string({ required: false })
        },
        resolve: async (_root, args) => {
            const conditions: SQL<unknown>[] = [eq(schema.graphics.entityType, args.entityType)];
            if (args.entityId) {
                conditions.push(eq(schema.graphics.entityId, args.entityId));
            }
            return db.select().from(schema.graphics).where(and(...conditions));
        }
    })
}));

builder.mutationFields((t) => ({
    registerGraphic: t.field({
        type: 'String',
        nullable: true,
        args: {
            entityId: t.arg.string({ required: true }),
            entityType: t.arg.string({ required: true }),
            url: t.arg.string({ required: true })
        },
        resolve: async (_root, args) => {
            return graphicsService.registerFromUrl(args.entityId, args.entityType, args.url);
        }
    }),
    autoSideloadGraphic: t.field({
        type: 'String',
        nullable: true,
        args: {
            entityId: t.arg.string({ required: true }),
            entityType: t.arg.string({ required: true })
        },
        resolve: async (_root, args) => {
            return graphicsService.autoSideloadGraphic(args.entityId, args.entityType);
        }
    })
}));
