ALTER TABLE "job_executions" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "job_executions" ADD COLUMN "processed_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "job_executions" ADD COLUMN "api_calls_count" integer DEFAULT 0;