-- Register the team recipe. Coach + venue were seeded in 0018 / 0019;
-- team is the third v1 recipe. Recipes are paired 1:1 with TS objects
-- under src/entities/tier-rankable-types/ — boot-time validation
-- asserts both sides line up.
INSERT INTO "tier_rankable_type" ("id", "name") VALUES ('team', 'Team')
ON CONFLICT ("id") DO NOTHING;
