import { builder, requireAdmin } from './builder';
import * as schema from '../db/schema';
import { repository } from '../repositories/postgres.repository';
import { graphicsService } from '../services/graphics.service';
import { storageProvider } from '../providers/storage';

const GraphicType = builder.objectRef<typeof schema.graphics.$inferSelect>('Graphic');

GraphicType.implement({
    fields: (t) => ({
        id: t.exposeString('id', { description: 'Unique internal UUID for this graphic record. Graphics are images (logos, photos) stored in Supabase Storage and associated with a specific entity.' }),
        entityType: t.exposeString('entityType', { description: 'Type of entity: "team", "league", "player", or "venue".' }),
        entityId: t.exposeString('entityId', { description: 'UUID of the entity (team, league, venue, or player) this graphic belongs to. Combined with entityType to form a unique association.' }),
        sourceUrl: t.exposeString('sourceUrl', { nullable: true, description: 'Original URL the graphic was downloaded from. Null for manually uploaded graphics.' }),
        blobPath: t.exposeString('blobPath', { description: 'Storage path within Supabase Storage (e.g. "graphics/team/uuid/logo.png").' }),
        mimeType: t.exposeString('mimeType', { description: 'MIME type of the stored image (e.g. "image/png").' }),
        metadata: t.expose('metadata', { type: 'JSON', nullable: true, description: 'Optional JSON metadata (dimensions, file size, etc.).' }),
        url: t.string({
            description: 'Public URL to download this graphic from Supabase Storage.',
            resolve: (graphic) => storageProvider.getPublicUrl('graphics', graphic.blobPath)
        }),
        createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this graphic was first uploaded.' }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp of the last update to this record.' })
    })
});

builder.queryFields((t) => ({
    graphics: t.field({
        description: 'Admin only. Returns graphics filtered by entity type and optionally by entity ID.',
        type: [GraphicType],
        args: {
            entityType: t.arg.string({ required: true, description: 'Entity type to filter by: "team", "league", "player", or "venue". Returns all graphics matching this type.' }),
            entityId: t.arg.string({ required: false, description: 'Optional UUID of a specific entity. When provided, narrows results to graphics for that exact entity. Omit to retrieve all graphics of the given entityType.' })
        },
        resolve: async (_root, args, ctx) => {
            requireAdmin(ctx);
            return repository.football.graphics.getGraphics(args.entityType, args.entityId ?? undefined);
        }
    })
}));

builder.mutationFields((t) => ({
    registerGraphic: t.field({
        description: 'Admin only. Downloads an image from the given URL and stores it in Supabase Storage, associating it with the specified entity.',
        type: 'String',
        nullable: true,
        args: {
            entityId: t.arg.string({ required: true, description: 'UUID of the entity to associate this graphic with (e.g. a team UUID). The graphic will be downloadable and cached under this entity.' }),
            entityType: t.arg.string({ required: true, description: 'Type of entity: "team", "league", "player", or "venue". Determines storage path and resolution logic.' }),
            url: t.arg.string({ required: true, description: 'Public URL of the image to download and store in Supabase Storage.' })
        },
        resolve: async (_root, args, ctx) => {
            requireAdmin(ctx);
            return graphicsService.registerFromUrl(args.entityId, args.entityType, args.url);
        }
    }),
    autoSideloadGraphic: t.field({
        description: 'Admin only. Attempts to discover and sideload a graphic for the given entity by checking its existing metadata for image URLs.',
        type: 'String',
        nullable: true,
        args: {
            entityId: t.arg.string({ required: true, description: 'UUID of the entity to automatically discover and sideload a graphic for. The system will attempt to find an image URL from the entity\'s existing data.' }),
            entityType: t.arg.string({ required: true, description: 'Type of entity: "team", "league", "player", or "venue". Determines which data source to check for an existing image URL.' })
        },
        resolve: async (_root, args, ctx) => {
            requireAdmin(ctx);
            return graphicsService.autoSideloadGraphic(args.entityId, args.entityType);
        }
    })
}));
