ALTER TABLE "jobs" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "raw_response" jsonb;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;