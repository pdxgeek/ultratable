ALTER TABLE "fixtures" ADD COLUMN "league_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "source_name" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "source_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_source_name_source_id_unique" UNIQUE("source_name","source_id");