ALTER TABLE "leagues" ADD COLUMN "source_name" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "source_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "source_name" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "source_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_source_name_source_id_unique" UNIQUE("source_name","source_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_source_name_source_id_unique" UNIQUE("source_name","source_id");