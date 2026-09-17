# Toph — Farm Activity Dashboard

Toph lets farm workers record short guided voice logs in the field — what
activity, which field, product/rate, and any notes — and gives farm admins a
dashboard to review them. A worker (or an admin uploading on the crew's
behalf) records or uploads audio; Toph transcribes it on-device, sends the
transcript to Claude for structured extraction, resolves who the log is for,
and files it. Admins see a filterable table, expandable rows with audio
playback and a satellite map of the field, tags, and read receipts.

Live: **https://toph-eight.vercel.app**

### Demo accounts

All accounts use the password `password123`.

| Email | Role |
| --- | --- |
| admin@baysranch.test | Admin |
| isaac@baysranch.test | Worker |
| maya@baysranch.test | Worker |
| liam@baysranch.test | Worker |
| sophia@baysranch.test | Worker |

The seeded demo passwords are intentionally public here — this is a review
deployment with synthetic data, not a real farm's account.

## What's implemented

- **Dashboard** — Figma-matched sidebar, stat cards (Today's Recordings,
  Active Workers, Response Accuracy), logs table, expandable row detail;
  search/sort/activity/field filters and a "This Month" toggle held in the
  URL so they survive a refresh or a shared link.
- **Auth and role-based access** — Supabase Auth (email/password) behind
  `proxy.ts`, redirecting unauthenticated requests to `/login`; roles
  (admin, manager, worker) enforced in Postgres via RLS, not just in the UI;
  a "Switch User" control for hopping between demo accounts.
- **Realtime** — the dashboard subscribes to `logs`/`log_tags`/`log_reads`
  changes over Supabase Realtime and refreshes (debounced) when they change.
- **Audio playback with stored waveform peaks** — wavesurfer.js against a
  signed Storage URL; peaks are computed once (client-side at record time,
  or decoded from the audio the first time an old log is played) and cached
  in `logs.waveform_peaks` so later views skip re-decoding.
- **Satellite field maps** — per-log map (MapLibre GL + Esri World Imagery)
  showing the field boundary and/or GPS point; a farm-wide Map page listing
  every field with acreage and a 30-day recent-log count, plus recent pins.
- **Tags and read receipts** — admins/managers create and attach/remove
  tags; per-user "new" state (`log_reads`) drives the unread badge.
- **Activity Logs page** — full-history table with server-side search,
  filtering (activity, field, date range), sorting, and pagination, built to
  stay fast as the log table grows, unlike the dashboard's in-memory table.
- **Map page** — see "Satellite field maps" above.
- **The AI voice-log pipeline** — record or upload → on-device Whisper
  transcription → editable transcript → Claude structured extraction →
  attribution → save. Full flow below.
- **Spoken-name attribution + admin uploads** — a spoken name in a recording
  is fuzzy-matched against the farm's people and confirmed before saving;
  admins/managers can upload a clip on the crew's behalf and pick who it
  belongs to (existing worker, existing crew member, or a new crew member).
- **The AI spend limiter** — per-IP and global monthly budget caps enforced
  in Postgres before every Claude call. Details below.
- **The nightly demo-data refresh** — a `pg_cron` job ages the seeded logs
  forward so the dashboard always looks freshly recorded. Details below.

**Not built** (explicitly out of scope for this challenge): Audit Manager,
Reports, Schedule, Employees, Performance, Messages, Settings, and Support
each render a "Coming soon" placeholder (`app/(app)/[section]/page.tsx`)
that says so; there's no "View All" button on the logs table (see "Design
fidelity"); no automated tests and no mobile/responsive layout (see "Known
limitations").

## Stack and why

| Choice | Why | What was rejected |
| --- | --- | --- |
| Next.js 16 (App Router) | Server components fetch with the signed-in user's Supabase session already attached, so there's no client-side loading flash on first paint. `proxy.ts` is Next 16's renamed `middleware.ts` (the old name is deprecated) and gates every request for auth before rendering. Server actions keep the Anthropic key and Supabase service-role key on the server — a pure SPA calling Claude directly would have to ship the key to the client. | A separate SPA + API backend — more moving parts, no benefit once Supabase auth cookies work through SSR. |
| TypeScript | End-to-end types from the database (`lib/database.types.ts`, `supabase gen types`) through server actions to components — extraction schema, RLS-shaped query results, and Zod input validation share real types instead of `any`. | Plain JS — loses the generated-types workflow entirely. |
| Tailwind v4 | Design tokens (colors, radii, shadows, font sizes) pulled from Figma live in `@theme` in `app/globals.css`, so a class like `bg-row-highlight` maps directly to a spec value instead of a repeated magic literal. | A component library (e.g. shadcn) — the spec is pixel-specific enough that overriding a generic kit would cost as much as building from tokens. |
| Supabase (Postgres) | One service for relational data, RLS (multi-tenant farm isolation), PostGIS (boundaries, GPS points), Storage (audio), and Realtime — no separate services to provision or keep in sync. | See "Why not MongoDB" below. |
| MapLibre GL + Esri World Imagery | Open-source renderer, free satellite basemap, no API key or billing account. | Mapbox / Google Maps — both need a billing account and API key for satellite tiles, friction for reviewers running this themselves. |
| wavesurfer.js | Mature waveform rendering + playback library with a peaks API matching what the app already computes client-side. | Hand-rolled `<canvas>` waveform — more code for a solved problem. |
| Whisper via transformers.js, in a Web Worker | On-device speech-to-text: free, private (raw audio never leaves the device), and matches the product's offline-first mobile story. Runs in a Worker so model download/inference don't block the UI thread. The Claude API takes no audio input, so a transcription step was required regardless of which LLM did extraction. | A hosted STT API — needs network access at record time, a second vendor key, and sends raw audio off-device. |
| Claude (`claude-opus-5`), structured extraction | Turns the free-form transcript into the fields the dashboard needs (activity, field, times, product/rate, notes, spoken name) via the Anthropic SDK's Zod structured-output helper, from a server action so the key stays server-side. | Regex/keyword matching over the transcript — too brittle against free speech ("I'm gonna go spray field A now" vs "sprayed field A this morning"). |
| Vercel | First-party Next.js hosting; built against it from the start (server actions, image optimization, env var conventions). | — |

### Why not MongoDB

Every screen joins across entities — a log with its employee, field, tags,
and answers; a stat card aggregating by day in the farm's timezone; a map
grouping logs by field. Postgres does that in one indexed query (`log_feed`)
instead of application-side fan-out. Multi-tenant access control (a worker
sees only their own logs, an admin sees the whole farm) is expressed once in
RLS policies and enforced by the database for every client, instead of
being re-implemented in every query path. PostGIS is a first-class
relational extension, not something bolted onto a document store. The one
part of this schema that's arguably document-shaped — the guided
question/answer pairs behind each log — is still a normalized table
(`log_answers`, one row per question) because it needs the same per-viewer
RLS as everything else, over a fixed small set of question keys.

**Tradeoffs worth naming**: on-device Whisper is slower on first use (model
download, tens of MB, cached afterward) and less accurate than a paid
hosted API, especially on noisy audio or accents outside its training
distribution — acceptable for a demo, not something to ship unchanged to
production without evaluating accuracy on real field recordings.

## Local development

### Prerequisites

- Node 24
- Docker Desktop (for the local Supabase stack)

### Setup

```bash
npm install
npx supabase start        # boots the local Supabase stack in Docker
npx supabase db reset     # applies migrations + supabase/seed.sql
npm run db:seed-audio     # uploads the 4 demo audio files, fills in duration_s
npm run dev
```

`npx supabase db reset` re-runs every migration and re-seeds from scratch,
which clears `duration_s` on the 4 audio-backed demo logs (it's set by
`scripts/seed-audio.mjs`, not by `seed.sql`) — re-run `npm run db:seed-audio`
after every reset.

### Environment files

Copy `.env.example` and fill in the keys it lists:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public
  Supabase project credentials, shipped to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS; server-only, used by
  `lib/supabase/admin.ts` (the AI spend limiter's RPCs) and by
  `scripts/seed-audio.mjs`.
- `ANTHROPIC_API_KEY` — server-only, used by `lib/ai/extract-core.ts`.
- `AI_LIMIT_SALT` — optional HMAC key for hashing client IPs in the spend
  limiter; falls back to the service-role key if unset.
- `FIGMA_TOKEN` — used only by `scripts/figma/*`, not the running app.
- `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` — used by scripts that talk
  to the linked cloud project (e.g. `supabase db push`).

Local development runs against the Dockerised Supabase stack started by
`npx supabase start` (put those local-stack values — it prints the URL and
anon key — in `.env.development.local`, which is git-ignored), while the
deployed app on Vercel uses the hosted Supabase project. Next.js loads
`.env.development.local` before `.env.local` in development, so local values
there override whatever cloud values might be sitting in `.env.local`. The
same migrations and `seed.sql` drive both environments — the cloud project is
kept in sync with `supabase db push --include-seed`.

## Database design

### Tables

- **`farms`** — tenant root; every other table hangs off `farm_id`.
- **`profiles`** — 1:1 with `auth.users`; carries `farm_id`, `role`
  (`user_role` enum: `admin`/`manager`/`worker`), `full_name`, `avatar_url`,
  `is_active`.
- **`fields`** — `boundary` (PostGIS `geography(Polygon, 4326)`, source of
  truth), plus trigger-maintained `centroid` and `acres`.
- **`logs`** — one row per voice log: `employee_id` (whose work it is),
  `uploaded_by` (who filed it), `field_id`, `activity` (`activity_type`
  enum), `started_at`/`ended_at`, `audio_path`/`audio_mime`/`duration_s`,
  `waveform_peaks` (jsonb), `transcript`, `summary`, `details` (jsonb —
  product/rate/notes/confidence), `location` (PostGIS `geography(Point,
  4326)`), `source` (`mobile`/`web`/`seed`), `spoken_name`,
  `attributed_profile_id`, `attributed_crew_member_id`.
- **`log_answers`** — the raw guided Q&A pairs behind a log (one row per
  question), each with `is_valid` — feeds the Response Accuracy stat.
- **`tags`** / **`log_tags`** — farm-scoped tags and a log/tag join table.
- **`log_reads`** — per-user read receipts (row = "this user has read this
  log"); drives the "N New" badge.
- **`crew_members`** — a person who works the farm but has no login (no
  `auth.users` row), so a log can be attributed to them.
- **`demo_state`** — single-row bookkeeping for the nightly demo refresh.
- **`ai_limits`** / **`ai_usage`** — spend-limiter configuration and
  per-call usage ledger.

### Enums

`user_role` (`admin`/`manager`/`worker`) and `activity_type` (`spraying`,
`fertilizing`, `planting`, `irrigating`, `harvesting`, `scouting`, `pruning`,
`soil_work`, `equipment_maintenance`) are Postgres enums rather than free
text, so a typo or a label drift ("Spray" vs "spraying") is rejected by the
type system instead of silently breaking a filter or a group-by.

### PostGIS

`fields.boundary` and `logs.location` are `geography(..., 4326)` columns
(GIST-indexed). `fields.centroid` and `fields.acres` are derived from
`boundary` by a `BEFORE INSERT OR UPDATE` trigger rather than a generated
column: Postgres requires a generated column's expression to be `IMMUTABLE`,
but the PostGIS geography functions used (`ST_Centroid`, `ST_Area`) are only
`STABLE` — they depend on the spheroid model used for geodesic calculation,
not purely on their inputs — so `generated always as (...) stored` is
rejected for them, and a trigger is the standard workaround.

### Row Level Security

Every table has RLS enabled. Two `SECURITY DEFINER` helper functions,
`current_farm_id()` and `current_user_role()`, read the caller's own
`profiles` row (bypassing RLS themselves, with `set search_path = ''`
hardening) so every other policy can filter by farm/role without each policy
re-deriving that lookup and risking a recursive policy reference back into
`profiles`. On top of that:

- **Farm isolation**: nearly every policy includes `farm_id =
  current_farm_id()`.
- **Workers** see and insert only their own logs (`employee_id = auth.uid()`
  on select and insert); there's no worker update/delete policy — a
  submitted log is treated as an immutable field record.
- **Admins/managers** see and manage every log farm-wide, and may insert a
  log for *any* active profile on their own farm (the admin-upload path) —
  but that insert policy also requires `uploaded_by = auth.uid()`, so the
  audit trail of who actually filed the log is guaranteed by the database,
  not trusted from application code.

### Views

- **`log_feed`** — the dashboard's read model: one row per log, pre-joined
  with employee, field (+ GeoJSON boundary), tags, answers, attribution, and
  uploader, plus a per-caller `is_new` flag. Declared `security_invoker`, so
  it carries no privilege of its own and inherits the querying user's RLS
  visibility (admin sees the farm, worker sees their own rows) with no role
  branching inside the view.
- **`fields_geo`** — every field's boundary/centroid as GeoJSON, for the Map
  page. Separate from `log_feed.field_boundary` because PostgREST returns a
  raw `geography` column as hex-encoded EWKB, and `log_feed` is scoped to
  logs the viewer can see — a worker who never recorded in a given field
  would see no polygon for it there. `fields_geo` casts with `ST_AsGeoJSON`
  once, farm-wide, still inheriting `fields` RLS via `security_invoker`.

### RPCs

- **`dashboard_stats()`** — `SECURITY INVOKER` (Postgres's default, stated
  explicitly), so it returns numbers scoped to the caller's own RLS
  visibility — an admin gets farm-wide counts, a worker gets counts over
  their own logs, from the same function. "Today" is computed in the farm's
  own timezone (`farms.timezone`), not UTC or the server's timezone.
- **`mark_logs_read(p_log_ids)`** — inserts read receipts for `auth.uid()`
  only, `on conflict do nothing` (idempotent).
- **`match_person_by_name(p_name)`** — `SECURITY DEFINER`, trigram
  similarity (`pg_trgm`) over active profiles and crew members on the
  caller's farm.
- **`ai_budget_check(p_ip_hash)`** / **`ai_usage_record(...)`** —
  `SECURITY DEFINER`, granted only to `service_role` (see "AI spend
  limiter").
- **`refresh_demo_data()`** — `SECURITY DEFINER`, called only by the
  scheduled `pg_cron` job (see "Demo data freshness").

### Storage

Audio lives in a private `recordings` bucket at
`<farm_id>/<uploader_id>/<log_id>.<ext>` — always the *uploader's* id, even
when the log is attributed to someone else. A storage policy authorizes
select/insert straight from the object path (`storage.foldername()`)
without a join back to `logs`. A delete policy lets a user remove only their
own, unreferenced object (`not exists (select 1 from logs where
audio_path = name)`) — cleanup after a failed save can't delete evidence
attached to a submitted log.

### Log ownership semantics

`employee_id` is who the work belongs to; `uploaded_by` is who filed the
clip. Three cases:

1. **Worker records themselves**: `employee_id = uploaded_by = auth.uid()`.
2. **Admin/manager uploads, matched to a worker's profile**: `employee_id`
   = that worker, `uploaded_by` = the admin.
3. **Admin/manager uploads, matched to (or creates) a crew member with no
   login**: `employee_id = uploaded_by` = the admin, but
   `attributed_crew_member_id` is set, so `display_name` (via
   `coalesce(attributed_name, employee_name)`) shows the crew member, not
   the admin.

### Migrations

| File | Purpose |
| --- | --- |
| `20260916120001_extensions_and_enums.sql` | Installs PostGIS; defines `user_role` and `activity_type` enums. |
| `20260916120002_tables_and_indexes.sql` | Core tables (`farms`, `profiles`, `fields`, `logs`, `log_answers`, `tags`, `log_tags`, `log_reads`) plus indexes and the centroid/acres trigger. |
| `20260916120003_helpers_rls.sql` | `current_farm_id()`/`current_user_role()` helpers; RLS policies for all core tables. |
| `20260916120004_views_rpcs.sql` | `log_feed` view, `dashboard_stats()` and `mark_logs_read()` RPCs. |
| `20260916120005_storage_realtime.sql` | `recordings` storage bucket + policies; adds `logs`/`log_tags`/`log_reads` to the realtime publication. |
| `20260916120006_demo_data_refresh.sql` | `demo_state` table and `refresh_demo_data()`, scheduled nightly via `pg_cron`. |
| `20260916120007_ai_spend_limits.sql` | `ai_limits`/`ai_usage` tables, `ai_budget_check()`/`ai_usage_record()` RPCs (service-role only), orphan-audio delete policy. |
| `20260917120001_person_attribution.sql` | `pg_trgm`; `crew_members` table; `logs` attribution columns; `match_person_by_name()`; rebuilds `log_feed`. |
| `20260917120002_real_field_boundaries.sql` | Replaces the original hand-drawn field rectangles with real OpenStreetMap farmland parcels near Faribault, Minnesota; re-places existing log GPS points inside their new fields. |
| `20260917120003_admin_uploads.sql` | Adds `logs.uploaded_by`; admin/manager insert policy; rebuilds `log_feed` with uploader info. |
| `20260917120004_fields_geo_and_upload_guard.sql` | Adds the `fields_geo` view; hardens the admin/manager insert policy to also pin `uploaded_by = auth.uid()`. |

Note: this repo has 11 migration files, not 9 — the two 2026-09-17 batches
each contain more files than a quick glance suggests.

## The AI voice-log pipeline

1. **Record or upload** — `VoiceRecorder.tsx` captures audio via
   `MediaRecorder` or accepts a file upload (up to 20 MB).
2. **Decode + resample** — the blob is decoded to an `AudioBuffer` and
   resampled to 16 kHz mono (`lib/audio/process.ts`), the format Whisper
   expects; waveform peaks are computed here too, client-side.
3. **Transcribe** — the 16 kHz mono audio goes to a Web Worker
   (`components/whisper.worker.ts`) running `@huggingface/transformers`'
   speech-recognition pipeline (`onnx-community/whisper-base.en`, falling
   back to `Xenova/whisper-tiny.en`), entirely in the browser. The model
   downloads once and is cached afterward.
4. **Review** — the transcript is shown in an editable textarea; Whisper
   isn't always perfect, so the worker can fix it before submitting.
5. **`prepareVoiceLog`** (server action) — checks the AI spend budget, then
   calls Claude (`extractVoiceLog`) with a Zod output schema
   (`lib/ai/extract-core.ts`) whose `field_name` enum is built from the
   farm's actual field names, so Claude can only return a field that exists.
   If a person's name was extracted, `match_person_by_name` resolves it
   against the farm's profiles/crew members.
6. **Identify** — if the spoken name is ambiguous, unmatched, or the caller
   is an admin/manager (who must always choose explicitly), the UI shows a
   confirmation/picker step before saving.
7. **Upload** — the audio blob is uploaded to Storage at
   `<farm_id>/<uploader_id>/<log_id>.<ext>`.
8. **`createVoiceLog`** (server action) — re-validates the extraction
   against the same farm-scoped Zod schema, re-checks role-based attribution
   rules, and inserts the `logs` + `log_answers` rows.

Design notes:

- The extraction call uses Anthropic's Zod structured-output helper
  (`betaZodOutputFormat`) with `output_config.effort: "low"`, and a
  `system-side-fallback` beta + `fallbacks: "default"` so a refusal or
  transient failure can fail over rather than erroring outright.
- The transcript is wrapped in `<transcript>` tags in the prompt and the
  system prompt explicitly tells Claude to treat it as untrusted data, never
  as instructions — a worker's recorded speech is user-supplied content.
- The extraction result from `prepareVoiceLog` is round-tripped through the
  client's React state (through the Identify step) and passed back to
  `createVoiceLog`, which re-validates it server-side against the same
  schema before using it. This is safe because it's always the signed-in
  caller's own not-yet-saved log, and it means confirming attribution on the
  Identify step doesn't trigger a second Claude call (and a second charge)
  for the same recording.
- Measured cost is approximately **$0.021–$0.024 per log**, at roughly
  **2,300 input tokens** and **400–550 output tokens** per call — these
  numbers are measured from real calls against this schema and system
  prompt, not a published benchmark.

## Spoken-name attribution

`match_person_by_name(p_name)` uses `pg_trgm` trigram similarity, compared
against both a candidate's full name and their first name token, over every
active profile and crew member on the caller's farm. Candidates below a
0.35 similarity score are dropped; the top 5 remaining are returned, ranked
by score.

- If the top match is the caller themselves with a score of at least 0.6,
  the UI treats it as confident self-identification (a worker saying their
  own name) and, for a worker, proceeds straight to saving.
- Otherwise, if any candidates matched, the UI shows them for confirmation.
- If nothing matched (score < 0.35 for everyone), the UI treats the spoken
  name as unknown and offers to add them as a new crew member, or to search
  again.

An admin/manager is never allowed to auto-proceed, regardless of match
confidence — an upload with nobody explicitly chosen would otherwise silently
file the log under the admin. This is also why admin uploads are the primary
use case for this feature at all: field workers only ever use their own
phone app and record themselves, so the ambiguous case — "whose log is
this?" — mostly arises when an admin is filing a batch of clips on the
crew's behalf.

## AI spend limiter

Two caps, checked before every Claude call and enforced in Postgres:

- **$1.00 per IP address**, in the trailing 60 minutes.
- **$10.00 globally**, in the current UTC calendar month, across every
  caller.

`ai_usage` logs one row per extraction call (successful or not, as long as
tokens were spent), with `cost_usd` derived from that response's actual
token usage (`lib/ai/pricing.ts`) rather than an estimate. `ai_limits` holds
the two thresholds as data, so they can be tuned with an `UPDATE` instead of
a deploy. Both tables have RLS enabled with **no policies at all** (denying
every row to `anon`/`authenticated` outright) and their table privileges are
explicitly revoked from those roles as well, belt-and-suspenders. The two
functions that touch them (`ai_budget_check`, `ai_usage_record`) are
`SECURITY DEFINER` and granted `EXECUTE` only to `service_role` — if
`authenticated` could call them, anyone signed into a public demo account
could insert fake spend rows and drive the global monthly total over the
cap, locking out every other user as a denial-of-service through the
limiter itself. Because of that, the budget check always runs server-side
through `lib/supabase/admin.ts` (the service-role client), never from the
browser.

The check **fails closed**: any error from the RPC (network issue,
unexpected exception) denies the request rather than allowing it through
(`lib/ai/budget.ts`). Caller IPs are never stored raw — `getClientIpHash`
HMAC-SHA256-hashes the IP with `AI_LIMIT_SALT` (or the service-role key, if
that env var isn't set) before it ever reaches the database.

Separately, the Anthropic account behind this deployment also has a hard
monthly spend cap set in the Anthropic Console, as a backstop independent of
this application-level limiter.

## Demo data freshness

`supabase/seed.sql` generates 29 demo logs relative to `now()` (4 headline
logs with real audio, 5 logs "today", 20 more spread across the trailing 60
days) so a fresh `db reset` always looks current. Left alone, those
timestamps go stale — days after seeding, "Todays Recordings" and the "This
Month" filter would show nothing.

A `pg_cron` job, `refresh-demo-data` (`supabase/migrations/
20260916120006_demo_data_refresh.sql`), runs nightly and calls
`public.refresh_demo_data()`, which:

- Shifts `started_at`, `ended_at`, and `created_at` forward — for rows with
  `source = 'seed'` only — by the number of farm-local calendar days elapsed
  since the data was last refreshed. Real (non-seed) logs are never touched.
- Clears the admin's read receipts on the specific logs `seed.sql` left
  unread, so the "N New" badges reappear each day instead of staying
  permanently read.

To run it by hand (e.g. right after a deploy, instead of waiting for the
next scheduled tick), run in the SQL editor:

```sql
select public.refresh_demo_data();
```

## Deployment

Hosted on Vercel, backed by a hosted Supabase project (not the local Docker
stack). The same migrations and `supabase/seed.sql` that run locally are
pushed to the cloud project with `supabase db push --include-seed`.

Required environment variables, set in the Vercel project:

| Variable | Visibility |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (shipped to the browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (shipped to the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only |
| `ANTHROPIC_API_KEY` | Server-only |
| `AI_LIMIT_SALT` | Server-only, optional |

`NEXT_PUBLIC_SUPABASE_URL` must be the bare project URL (`https://
<ref>.supabase.co`) — not a URL with a path like `/rest/v1` appended, which
breaks both the `@supabase/ssr` browser client and the admin client.

## Design fidelity

The Figma file was pulled through the Figma REST API using small one-off
scripts in `scripts/figma/` (`fetch-tree.mjs` to locate the two Dashboard
frames, `fetch-nodes.mjs` for their full node trees, `fetch-images.mjs` for
source images and 2x reference PNG renders, `flatten.mjs` to dump geometry/
fills/effects/text styles into a readable form) — not read by hand in the
Figma UI. The result is `design/figma-spec.md`, a written spec of layout,
colors, typography, and icon mapping, plus 2x reference renders of both
frames in `public/figma/ref-default.png` and `public/figma/ref-expanded.png`
used for pixel comparison while building.

Extracted values live as Tailwind v4 `@theme` tokens (colors, radii,
shadows, font sizes) — `design/tokens.css` is the reference copy alongside
the spec, and the same tokens are defined for real in `app/globals.css`,
which Tailwind actually reads. A component class like `bg-row-highlight` or
`rounded-logs-card` therefore maps to a specific Figma value instead of a
literal repeated across files.

Deliberate deviations from the Figma file:

- **Default sort is newest-first**, not the Figma table's oldest-first
  ordering (its 11 rows run April 19 → April 29). A logs dashboard should
  surface the most recent activity first; the Figma ordering looks like an
  artifact of how the mock rows were authored, not an intentional UX choice.
- **No "View All" button.** The design's layer tree names one in the logs
  table header, but it doesn't appear in either rendered reference frame
  (`ref-default.png`/`ref-expanded.png`) — nothing to match visually, and
  the Activity Logs page already covers "see everything."
- **A checked-checkbox style was invented.** The Figma file only contains
  the unchecked `square` icon; no checked or indeterminate state exists
  anywhere in it. The app renders a filled black square with a white check
  for the checked state, matching the rest of the UI's black/white
  palette.
- **Field boundaries are real OpenStreetMap farmland parcels** near
  Faribault, Minnesota, not the original hand-drawn rectangles. The first
  attempt at hand-drawn coordinates happened to land on woodland and a lake
  on the satellite basemap, which looked wrong for a farm product; the
  boundaries were replaced with actual `landuse=farmland` parcels from
  OpenStreetMap (ODbL) in `20260917120002_real_field_boundaries.sql`. The
  trigger-computed acreages of the four parcels are 45.7, 87.6, 57.6 and
  70.2 acres (FIELD A–D), and every seeded log's GPS point was moved to a
  point inside its field with `ST_PointOnSurface`.

## Known limitations / what I'd do next

- **On-device Whisper accuracy and download size.** `whisper-base.en` is
  more accurate than the tiny fallback but still a step down from a hosted
  API, especially on noisy field audio or non-native accents; the model
  download (tens of MB) must finish before a fresh device's first
  transcription.
- **Demo passwords are public** (`password123`, in this README and
  `lib/demo-accounts.ts`) — fine for a reviewable demo, not for a real
  deployment.
- **No automated tests.** Verification was manual: `psql`/SQL-editor checks
  of migrations and RLS (querying as different roles to confirm farm
  isolation and worker/admin visibility), scripted Supabase queries against
  seeded data, and manual browser passes through each flow (record →
  transcribe → review → identify → save; filtering/sorting; tag add/remove;
  map interactions). A real next step: integration tests around RLS (most
  likely to regress silently) and around the client-round-trip re-validation
  in `createVoiceLog`.
- **Placeholder sidebar sections.** Audit Manager, Reports, Schedule,
  Employees, Performance, Messages, Settings, Support all render "Coming
  soon. Not part of this challenge scope." (`app/(app)/[section]/page.tsx`).
- **Mobile layout is not the target.** The Figma spec is a fixed 1676px
  desktop frame; the app matches it at that width and hasn't been adapted
  for phone-sized viewports.
- **Most seeded logs have no audio.** Only the 4 "headline" logs
  (`seed-audio/*.m4a`) carry a real recording; the other 25 have a
  transcript/summary but no `audio_path`, so their expanded row shows "No
  Recording."

## Repository layout

```
app/
  (app)/                Authenticated routes (behind proxy.ts)
    dashboard/           Dashboard page (stats + logs table)
    activity-logs/       Full-history, server-paginated logs table
    map/                 Farm-wide field/log map
    record/              Voice-log recording/upload flow
    [section]/           Placeholder routes for out-of-scope sidebar items
  (auth)/login/          Login page
  actions/               Server actions (auth, logs, voice-log pipeline)
components/               UI components (table, map, waveform, recorder, ...)
lib/
  ai/                    Claude extraction schema/prompt, pricing, budget checks
  audio/                 Client-side audio decode/resample/peaks helpers
  supabase/              Browser/server/admin Supabase clients, proxy session refresh
  data.ts, data-pages.ts  Server-side data access (dashboard vs. activity-logs/map)
  filter-logs.ts          Pure client-side filter/sort for the dashboard table
  format.ts, tz.ts         Farm-timezone-aware date/time formatting helpers
  mock-feed.ts            Early static mock dataset, superseded by the Supabase
                           data layer above — no longer referenced by the app
supabase/
  migrations/             11 SQL migrations, applied in order (see table above)
  seed.sql                Demo farm, users, fields, tags, and 29 logs
  seed-audio-map.json      Maps the 4 real audio files to their seeded log ids
scripts/
  figma/                  One-off scripts used to pull design/figma-spec.md
  seed-audio.mjs           Uploads seed audio + backfills duration_s
seed-audio/                The 4 real .m4a clips scripts/seed-audio.mjs uploads
design/
  figma-spec.md            Written design spec extracted from Figma
  tokens.css               Reference copy of the Tailwind @theme tokens
public/figma/               Reference renders + source images from the Figma file
```
