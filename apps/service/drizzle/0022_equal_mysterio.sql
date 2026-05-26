CREATE TYPE "public"."prediction_event_kind" AS ENUM('created', 'locked', 'unlocked', 'edited_post_lockin', 'deleted');--> statement-breakpoint
CREATE TABLE "prediction_match_picks" (
	"snapshot_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"note" text,
	"manually_added" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_match_picks_snapshot_id_fixture_id_pk" PRIMARY KEY("snapshot_id","fixture_id"),
	CONSTRAINT "prediction_match_picks_non_negative_goals_check" CHECK (("prediction_match_picks"."home_goals" IS NULL OR "prediction_match_picks"."home_goals" >= 0)
                AND ("prediction_match_picks"."away_goals" IS NULL OR "prediction_match_picks"."away_goals" >= 0))
);
--> statement-breakpoint
CREATE TABLE "prediction_snapshot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" "prediction_event_kind" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ALTER COLUMN "locked_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD COLUMN "gameweek" integer;--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "prediction_match_picks" ADD CONSTRAINT "prediction_match_picks_snapshot_id_prediction_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."prediction_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_match_picks" ADD CONSTRAINT "prediction_match_picks_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_snapshot_events" ADD CONSTRAINT "prediction_snapshot_events_snapshot_id_prediction_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."prediction_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_snapshot_events" ADD CONSTRAINT "prediction_snapshot_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_match_picks_snapshot_idx" ON "prediction_match_picks" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "prediction_snapshot_events_snapshot_idx" ON "prediction_snapshot_events" USING btree ("snapshot_id","created_at");--> statement-breakpoint
CREATE INDEX "prediction_snapshots_live_by_gameweek_idx" ON "prediction_snapshots" USING btree ("user_id","season_id","type","gameweek") WHERE "prediction_snapshots"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_snapshots_title_per_scope_unique" ON "prediction_snapshots" USING btree ("user_id","season_id","type","gameweek","title") WHERE "prediction_snapshots"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD CONSTRAINT "prediction_snapshots_gameweek_shape_check" CHECK (("prediction_snapshots"."type" = 'gameweek') = ("prediction_snapshots"."gameweek" IS NOT NULL));