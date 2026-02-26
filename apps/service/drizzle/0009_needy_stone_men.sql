ALTER TABLE "graphics" DROP CONSTRAINT "graphics_entity_type_entity_id_variant_name_unique";--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "gameweek" integer;--> statement-breakpoint
ALTER TABLE "graphics" ADD COLUMN "source_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "is_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "last_live_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "graphics" DROP COLUMN "variant_name";--> statement-breakpoint
ALTER TABLE "graphics" ADD CONSTRAINT "graphics_entity_type_entity_id_unique" UNIQUE("entity_type","entity_id");