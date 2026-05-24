CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"age" integer,
	"birth_date" varchar(32),
	"birth_place" varchar(255),
	"birth_country" varchar(255),
	"nationality" varchar(255),
	"height" varchar(32),
	"weight" varchar(32),
	"photo" varchar(500),
	"team_id" uuid,
	"source_name" varchar(50) NOT NULL,
	"source_id" integer NOT NULL,
	"career" jsonb,
	"raw_response" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaches_source_name_source_id_unique" UNIQUE("source_name","source_id")
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaches_team_idx" ON "coaches" USING btree ("team_id");