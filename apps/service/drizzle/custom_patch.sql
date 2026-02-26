ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "is_completed" boolean DEFAULT false NOT NULL;
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "last_live_sync_at" timestamp with time zone;
