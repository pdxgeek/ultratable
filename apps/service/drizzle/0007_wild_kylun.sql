CREATE TABLE "catalog_countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(10),
	"flag" varchar(500),
	"source_name" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_countries_source_name_name_unique" UNIQUE("source_name","name")
);
--> statement-breakpoint
CREATE TABLE "catalog_leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50),
	"logo" varchar(500),
	"source_name" varchar(50) NOT NULL,
	"source_id" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_leagues_source_name_source_id_unique" UNIQUE("source_name","source_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_leagues" ADD CONSTRAINT "catalog_leagues_country_id_catalog_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."catalog_countries"("id") ON DELETE no action ON UPDATE no action;