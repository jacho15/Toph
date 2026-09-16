# Toph — Farm Activity Dashboard

Toph lets farm workers record short guided voice logs in the field (what
activity, which field, product/rate, yield, etc.) and gives farm admins a
dashboard to review them: summary stats (today's recordings, active
workers, response accuracy), a filterable logs table, expandable rows with
audio playback, tags, and a satellite map of the field each log was
recorded in.

## Tech stack

| Technology | Why |
| --- | --- |
| Next.js 16 (App Router) | Server components fetch data with the signed-in user's session already attached; `proxy.ts` (the App Router's post-`middleware.ts` request-interception file) gates auth before rendering; server actions keep the Anthropic API key server-side, never shipped to the client. |
| Supabase Postgres | One database for relational data, Row Level Security (multi-tenant isolation between farms), PostGIS (field boundaries, log locations), Storage (audio files), and Realtime (live log updates) — no separate services to wire together. |
| MapLibre GL + Esri World Imagery | Open-source map renderer with a free satellite basemap — no API key or billing account required, unlike Mapbox/Google Maps. |
| wavesurfer.js | Renders the waveform and drives playback for each log's recorded audio. |
| In-browser Whisper (transformers.js) | **Planned.** On-device transcription of recorded audio, so raw audio never has to leave the client to get a transcript. |
| Claude (structured extraction) | **Planned.** Turns a raw transcript into the structured fields shown in a log (activity type, product, rate, yield, etc.), called from a server action so the Anthropic API key stays server-side. |

## Local development

### Prerequisites

- Node 24
- Docker Desktop (for the local Supabase stack)

### Setup

```bash
npm install
npx supabase start        # boots the local Supabase stack in Docker
npx supabase db reset      # applies migrations + supabase/seed.sql
npm run db:seed-audio      # uploads the 4 demo audio files and fills in their waveform_peaks
npm run dev
```

### Environment files

Copy `.env.example` and fill in the keys it lists:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase project credentials.
- `ANTHROPIC_API_KEY` — used server-side only.
- `FIGMA_TOKEN` — used by the scripts in `scripts/figma/`, not the app itself.
- `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` — used by scripts that talk to the linked cloud project.

For local development, put local-stack values in `.env.development.local`
(git-ignored) — `npx supabase start` prints the local URL and anon key to
use there. Next.js loads `.env.development.local` before `.env.local` in
development, so it overrides whatever cloud values might be sitting in
`.env.local`.

## Demo accounts

All accounts use the password `password123`.

| Email | Role |
| --- | --- |
| admin@baysranch.test | admin |
| isaac@baysranch.test | worker |
| maya@baysranch.test | worker |
| liam@baysranch.test | worker |
| sophia@baysranch.test | worker |

## Demo data freshness

`supabase/seed.sql` computes its demo logs relative to `now()` (5 logs
"today", 4 headline logs on recent days in the seeded month, 20 more spread
across the trailing 60 days), so a fresh `db reset` always looks current.
Left alone, those timestamps go stale — days after seeding, "Todays
Recordings" and the "This Month" filter would show nothing.

To keep the demo looking freshly recorded, a `pg_cron` job
(`refresh-demo-data`, scheduled nightly at ~00:05 America/Chicago) calls
`public.refresh_demo_data()`, which:

- Shifts `started_at`, `ended_at`, and `created_at` forward, for logs with
  `source = 'seed'` only, by the number of days elapsed since the data was
  last refreshed. Logs from real usage (`source <> 'seed'`) are never
  modified.
- Clears the admin's read receipts on the specific logs `seed.sql` left
  unread, so the "N New" / unread badges reappear each day instead of
  staying permanently "read".

This is defined in `supabase/migrations/20260916120006_demo_data_refresh.sql`.
To run it by hand (e.g. to refresh the demo immediately instead of waiting
for the next scheduled tick), run in the SQL editor:

```sql
select public.refresh_demo_data();
```

## Database design

- **Tables**: `farms` (tenant root) → `profiles` (1:1 with `auth.users`,
  carries `farm_id` + `role`), `fields` (PostGIS polygon boundaries),
  `logs` (one row per voice log), `log_answers` (raw guided Q&A pairs),
  `tags` / `log_tags`, `log_reads` (per-user read receipts).
- **Row Level Security**: every table has RLS enabled; policies branch on
  two `security definer` helper functions, `current_farm_id()` and
  `current_user_role()`, which read the caller's own `profiles` row
  (bypassing RLS themselves to avoid a recursive policy lookup) so every
  other policy can filter by farm and role without repeating that lookup.
- **`log_feed`**: a `security_invoker` view that pre-joins each log with
  its employee, field (+ GeoJSON boundary), tags, and answers, plus a
  per-caller `is_new` flag. Because it's `security_invoker` (not
  `security definer`), it carries no privilege of its own — it inherits
  the querying user's RLS visibility automatically.
- **`dashboard_stats()`**: an RPC returning the dashboard's summary
  numbers, computed under the caller's own RLS (so an admin gets farm-wide
  counts and a worker gets counts scoped to their own logs from the same
  function). "Today" is evaluated in the farm's own timezone
  (`farms.timezone`), not UTC or the server's timezone.
- **Storage**: audio files are stored at
  `<farm_id>/<employee_id>/<log_id>.<ext>` in a private `recordings`
  bucket, so a storage policy can authorize access straight from the
  object path (via `storage.foldername()`) without a join back to `logs`.
- **Field geometry**: `fields.centroid` and `fields.acres` are derived
  from `fields.boundary` by a `BEFORE INSERT OR UPDATE` trigger rather
  than a generated column, because Postgres requires a generated column's
  expression to be `IMMUTABLE`, and the PostGIS geography functions used
  (`ST_Centroid`, `ST_Area`) are only `STABLE`.

## Roadmap / reach goals

- AI voice-log pipeline: in-browser Whisper transcription (transformers.js)
  feeding Claude for structured extraction, replacing the current
  guided-question flow with free-form recordings.
- Spoken-name attribution: auto-match an existing worker by the name said
  at the start of a recording, falling back to prompting the admin to
  create a new worker or choose among similarly-named existing workers.
- Realtime updates: push new logs, tag changes, and read-state changes to
  the dashboard live via Supabase Realtime instead of requiring a refresh.
