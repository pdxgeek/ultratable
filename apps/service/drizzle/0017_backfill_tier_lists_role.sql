-- Backfill the new 'tier-lists' role onto every existing domain user that
-- isn't a guest and doesn't already have it. New users (created via
-- auth-bootstrap.ts after this migration lands) get
-- ['user', 'predictions', 'tier-lists'] from the insert path; this only
-- handles rows created before that change.
--
-- Idempotent: re-running is a no-op because of the @> guard.
--
-- The auth_user.role mirror (Better Auth admin plugin's primary role string)
-- is intentionally not updated here — tier-lists is additive, so the primary
-- role at roles[0] is unchanged and the mirror stays in sync.
UPDATE "user"
SET "roles" = "roles" || '["tier-lists"]'::jsonb
WHERE NOT ("roles" @> '["tier-lists"]'::jsonb)
  AND NOT ("roles" @> '["guest"]'::jsonb);
