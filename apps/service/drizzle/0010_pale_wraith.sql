CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"firstname" varchar(255),
	"lastname" varchar(255),
	"age" integer,
	"nationality" varchar(100),
	"photo" varchar(500),
	"injured" boolean DEFAULT false NOT NULL,
	"source_name" varchar(50) NOT NULL,
	"source_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_source_name_source_id_unique" UNIQUE("source_name","source_id")
);
