# Credentials to Rotate

These were committed in `apps/service/.env` and are now in git history. Rotate all of them.

- `DATABASE_URL` — Supabase Postgres password
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `API_FOOTBALL_KEY`
- `AUTH_SECRET`

After rotating, update your local `.env` with the new values and delete this file.
