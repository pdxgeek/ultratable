CREATE TABLE "prediction_snapshot_entries" (
	"snapshot_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "prediction_snapshot_entries_snapshot_id_team_id_pk" PRIMARY KEY("snapshot_id","team_id"),
	CONSTRAINT "prediction_snapshot_entries_snapshot_id_position_unique" UNIQUE("snapshot_id","position")
);
--> statement-breakpoint
CREATE TABLE "prediction_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"locked_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "prediction_snapshot_entries" ADD CONSTRAINT "prediction_snapshot_entries_snapshot_id_prediction_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."prediction_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_snapshot_entries" ADD CONSTRAINT "prediction_snapshot_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD CONSTRAINT "prediction_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD CONSTRAINT "prediction_snapshots_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_snapshots_live_per_scope_idx" ON "prediction_snapshots" USING btree ("user_id","season_id","type") WHERE "prediction_snapshots"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "prediction_snapshots_scope_idx" ON "prediction_snapshots" USING btree ("user_id","season_id","type");