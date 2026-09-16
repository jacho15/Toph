-- ============================================================================
-- 2. Tables + indexes
-- ============================================================================

-- farms ----------------------------------------------------------------------
-- Root tenant. Every other table hangs off farm_id, which is how multi-farm
-- isolation is enforced everywhere (both in RLS and in query filters).
create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);

-- profiles ---------------------------------------------------------------
-- 1:1 with auth.users, on delete cascade so a removed auth user can't leave
-- an orphaned profile behind. farm_id + role are the two columns every RLS
-- policy in this schema ultimately reads (via the current_farm_id() /
-- current_user_role() helpers defined in the next migration).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  farm_id uuid not null references public.farms (id),
  full_name text not null,
  email text,
  avatar_url text,
  role public.user_role not null default 'worker',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- fields -----------------------------------------------------------------
-- boundary is the source of truth (drawn/surveyed polygon used to render the
-- satellite map outline). centroid and acres are derived from it purely for
-- read-time convenience (map pin placement, stat display) so callers never
-- have to run ST_Centroid/ST_Area themselves.
--
-- These are NOT declared as generated columns: Postgres requires a generated
-- column's expression to be IMMUTABLE, but PostGIS geography functions
-- (ST_Centroid, ST_Area on `geography`) are STABLE — they depend on the
-- spheroid used for geodesic calculation, not just their inputs — so
-- `generated always as (...) stored` is rejected by Postgres for them. A
-- BEFORE INSERT OR UPDATE trigger is the standard workaround.
create table public.fields (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  name text not null,
  crop text,
  boundary extensions.geography(Polygon, 4326) not null,
  centroid extensions.geography(Point, 4326),
  acres numeric,
  created_at timestamptz not null default now(),
  unique (farm_id, name)
);

create function public.fields_set_computed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.centroid := extensions.ST_Centroid(new.boundary)::extensions.geography;
  -- geography ST_Area is geodesic (m^2 on the spheroid); divide by m^2/acre.
  new.acres := extensions.ST_Area(new.boundary) / 4046.8564224;
  return new;
end;
$$;

create trigger fields_set_computed
before insert or update of boundary on public.fields
for each row execute function public.fields_set_computed();

-- Spatial index on the boundary itself: the dashboard map needs to answer
-- "which field contains/overlaps this point or viewport" cheaply, and a
-- GIST index is what makes ST_Intersects/ST_Contains on geography fast.
create index fields_boundary_gix on public.fields using gist (boundary);

-- logs ---------------------------------------------------------------------
-- One row per voice log. field_id is nullable + ON DELETE SET NULL because a
-- log is a historical record of what happened; deleting a field later should
-- never cascade-delete the logs that reference it.
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  employee_id uuid not null references public.profiles (id),
  field_id uuid references public.fields (id) on delete set null,
  activity public.activity_type not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  audio_path text,
  audio_mime text,
  duration_s numeric,
  waveform_peaks jsonb,
  transcript text,
  summary text,
  -- Structured extraction from the transcript (product, rate, units, etc.).
  -- jsonb (not a fixed set of columns) because the shape varies by activity
  -- type and the extraction schema is expected to evolve independently of
  -- the table.
  details jsonb not null default '{}'::jsonb,
  location extensions.geography(Point, 4326),
  source text not null default 'mobile' check (source in ('mobile', 'web', 'seed')),
  created_at timestamptz not null default now(),
  constraint logs_ended_after_started check (ended_at is null or ended_at >= started_at)
);

-- Covers the dashboard's primary access pattern: "this farm's logs, newest
-- first" (table listing, stat cards).
create index logs_farm_started_idx on public.logs (farm_id, started_at desc);
create index logs_employee_idx on public.logs (employee_id);
create index logs_field_idx on public.logs (field_id);
create index logs_location_gix on public.logs using gist (location);

-- log_answers ----------------------------------------------------------------
-- The guided Q&A pairs behind each log (one row per question asked on the
-- mobile app), kept separate from `logs.details` because these are the raw
-- per-question responses (with a validity flag used for the Response
-- Accuracy stat), not the structured extraction.
create table public.log_answers (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.logs (id) on delete cascade,
  "position" int not null,
  question_key text not null,
  question text not null,
  answer text,
  is_valid boolean not null
);

create index log_answers_log_idx on public.log_answers (log_id);

-- tags -----------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per farm ("Verified" and "verified" are the
-- same tag) without forcing tag names into a canonical case in the app.
create unique index tags_farm_name_lower_idx on public.tags (farm_id, lower(name));

-- log_tags (join table) -------------------------------------------------
create table public.log_tags (
  log_id uuid not null references public.logs (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (log_id, tag_id)
);

-- log_reads --------------------------------------------------------------
-- Per-user read state for the "New Employee Logs" / "N New" unread badge.
-- Modeled as a join table (row = "this user has read this log") rather than
-- a boolean on `logs`, since "new" is inherently per-viewer, not global.
create table public.log_reads (
  log_id uuid not null references public.logs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (log_id, user_id)
);
