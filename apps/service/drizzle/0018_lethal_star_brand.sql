CREATE TABLE "tier_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"tier_rankable_type_id" text NOT NULL,
	"title" text NOT NULL,
	"tiers" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "tier_rankable_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_list_id" uuid NOT NULL,
	"tier_rankable_type_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"tier_key" text,
	"position" double precision NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"team_id" uuid,
	"source_type" text,
	"source_id" uuid,
	"source_path" jsonb,
	"name_override" text,
	"image_url_override" text,
	"subtitle" text,
	"added_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "tier_rankable_item_source_pointer_check" CHECK (("tier_rankable_item"."source_type" IS NULL) = ("tier_rankable_item"."source_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "tier_rankable_type" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_formula_id" varchar(50),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tier_list" ADD CONSTRAINT "tier_list_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_list" ADD CONSTRAINT "tier_list_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_list" ADD CONSTRAINT "tier_list_tier_rankable_type_id_tier_rankable_type_id_fk" FOREIGN KEY ("tier_rankable_type_id") REFERENCES "public"."tier_rankable_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_rankable_item" ADD CONSTRAINT "tier_rankable_item_tier_list_id_tier_list_id_fk" FOREIGN KEY ("tier_list_id") REFERENCES "public"."tier_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_rankable_item" ADD CONSTRAINT "tier_rankable_item_tier_rankable_type_id_tier_rankable_type_id_fk" FOREIGN KEY ("tier_rankable_type_id") REFERENCES "public"."tier_rankable_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_rankable_item" ADD CONSTRAINT "tier_rankable_item_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_rankable_type" ADD CONSTRAINT "tier_rankable_type_default_formula_id_ranking_formulas_id_fk" FOREIGN KEY ("default_formula_id") REFERENCES "public"."ranking_formulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tier_list_live_by_scope_idx" ON "tier_list" USING btree ("user_id","season_id","tier_rankable_type_id") WHERE "tier_list"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tier_list_scope_idx" ON "tier_list" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE INDEX "tier_rankable_item_live_by_list_idx" ON "tier_rankable_item" USING btree ("tier_list_id","deleted_at","tier_key","position");--> statement-breakpoint
CREATE INDEX "tier_rankable_item_instance_idx" ON "tier_rankable_item" USING btree ("tier_rankable_type_id","natural_key");--> statement-breakpoint
CREATE INDEX "tier_rankable_item_team_idx" ON "tier_rankable_item" USING btree ("team_id");--> statement-breakpoint
-- Seed the recipe registry with the v1 row. Player + venue come with
-- future migrations when their resolvers register.
-- `default_formula_id` is intentionally NULL — the formula seam is
-- wired but not consumed yet.
INSERT INTO "tier_rankable_type" ("id", "name") VALUES ('coach', 'Coach')
ON CONFLICT ("id") DO NOTHING;