ALTER TABLE "tier_list" ADD COLUMN "display_config" jsonb DEFAULT '{"showTeamNames": true}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tier_list" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Register the venue recipe. Coach was seeded in 0018; venue is the
-- second v1 recipe (umbrella #110). Recipes are paired 1:1 with TS
-- objects under src/entities/tier-rankable-types/ — boot-time
-- validation asserts both sides line up.
INSERT INTO "tier_rankable_type" ("id", "name") VALUES ('venue', 'Venue')
ON CONFLICT ("id") DO NOTHING;