CREATE TABLE "graphics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"variant_name" varchar(100) DEFAULT 'default' NOT NULL,
	"blob_path" varchar(500) NOT NULL,
	"mime_type" varchar(100) DEFAULT 'image/png' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graphics_entity_type_entity_id_variant_name_unique" UNIQUE("entity_type","entity_id","variant_name")
);
--> statement-breakpoint
CREATE TABLE "ranking_formulas" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"logic_type" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons_to_teams" (
	"season_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_to_teams_season_id_team_id_unique" UNIQUE("season_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" varchar(20) NOT NULL,
	"module" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"city" varchar(255),
	"capacity" integer,
	"surface" varchar(100),
	"image" varchar(500),
	"source_name" varchar(50) NOT NULL,
	"source_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_source_name_source_id_unique" UNIQUE("source_name","source_id")
);
--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "venue_id" uuid;--> statement-breakpoint
ALTER TABLE "job_executions" ADD COLUMN "total_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "job_executions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "venue_id" uuid;--> statement-breakpoint
ALTER TABLE "seasons_to_teams" ADD CONSTRAINT "seasons_to_teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons_to_teams" ADD CONSTRAINT "seasons_to_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "venue";--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_year_unique" UNIQUE("league_id","year");