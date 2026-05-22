CREATE TABLE "user_league_follows" (
	"user_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"followed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_league_follows_user_id_league_id_pk" PRIMARY KEY("user_id","league_id")
);
--> statement-breakpoint
ALTER TABLE "user_league_follows" ADD CONSTRAINT "user_league_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_league_follows" ADD CONSTRAINT "user_league_follows_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;