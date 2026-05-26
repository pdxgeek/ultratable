CREATE TABLE "gameweek_prediction_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"note" text,
	"manually_added" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gameweek_prediction_picks_non_negative_goals_check" CHECK (("gameweek_prediction_picks"."home_goals" IS NULL OR "gameweek_prediction_picks"."home_goals" >= 0)
                AND ("gameweek_prediction_picks"."away_goals" IS NULL OR "gameweek_prediction_picks"."away_goals" >= 0))
);
--> statement-breakpoint
CREATE TABLE "gameweek_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"gameweek" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "gameweek_prediction_picks" ADD CONSTRAINT "gameweek_prediction_picks_prediction_id_gameweek_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."gameweek_predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameweek_prediction_picks" ADD CONSTRAINT "gameweek_prediction_picks_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameweek_predictions" ADD CONSTRAINT "gameweek_predictions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameweek_predictions" ADD CONSTRAINT "gameweek_predictions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gameweek_prediction_picks_latest_per_fixture_idx" ON "gameweek_prediction_picks" USING btree ("prediction_id","fixture_id","created_at");--> statement-breakpoint
CREATE INDEX "gameweek_prediction_picks_slip_timeline_idx" ON "gameweek_prediction_picks" USING btree ("prediction_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gameweek_predictions_one_live_per_gameweek_idx" ON "gameweek_predictions" USING btree ("user_id","season_id","gameweek") WHERE "gameweek_predictions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "gameweek_predictions_live_by_user_season_idx" ON "gameweek_predictions" USING btree ("user_id","season_id") WHERE "gameweek_predictions"."deleted_at" IS NULL;