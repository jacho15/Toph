-- ============================================================================
-- 6. Demo data refresh (pg_cron)
--
-- Problem: supabase/seed.sql computes its 29 demo logs relative to `now()`
-- at seed time (5 "today" logs, 4 headline logs on recent days in the
-- seeded month, 20 spread over the trailing 60 days) so a fresh
-- `db reset` always looks current. But the seed only runs once — days
-- later, "Todays Recordings" and the "This Month" filter go empty because
-- the underlying timestamps never move. This migration adds a nightly job
-- that ages the seed data forward in lockstep with the calendar, so the
-- demo keeps looking freshly recorded indefinitely, without ever touching
-- real (non-seed) data.
-- ============================================================================

-- pg_cron is preloaded (see `shared_preload_libraries`) but not installed by
-- default. Supabase's documented convention is to register the extension
-- under `pg_catalog` (verified locally: `pg_extension.extnamespace` ends up
-- as `pg_catalog` regardless, since pg_cron's own objects always live in the
-- separate `cron` schema it creates for itself) rather than `public`, so the
-- job-management functions/tables don't clutter the exposed API schema.
create extension if not exists pg_cron with schema pg_catalog;

-- demo_state ---------------------------------------------------------------
-- Single-row table tracking the last date the demo data was "anchored" to.
-- `id boolean primary key default true check (id)` is the standard
-- singleton-table trick: the check constraint only allows `id = true`, and
-- the primary key then makes a second row impossible.
--
-- RLS is enabled with no policies at all, which denies every row to `anon`
-- and `authenticated` unconditionally (Supabase's default DB setup grants
-- broad table-level DML to those roles and relies on RLS to restrict rows,
-- same as every other table in this schema) — this table is refresh-job
-- bookkeeping only, never meant to be read or written from the client.
create table public.demo_state (
  id boolean primary key default true check (id),
  anchored_on date not null
);

alter table public.demo_state enable row level security;

-- Seed the single row with today's date in the farm's timezone, but only if
-- it doesn't already exist. This covers both places this migration runs:
--   - Locally, via `supabase db reset`: migrations run BEFORE seed.sql, so
--     "today" here is the same moment seed.sql will use for its own
--     "today" math a few seconds later -> delta stays 0 until the next
--     calendar day, exactly as intended.
--   - On the linked cloud project: this migration is applied after the
--     demo data has already been seeded once, on the same day (per the
--     deploy plan) -> anchoring to "today" again is still correct, since
--     the seeded timestamps and this anchor agree on what day they were
--     last fresh.
-- If this assumption ever breaks (e.g. the migration lands days after the
-- cloud seed ran), the first cron tick will only shift by the days between
-- deploy and that tick, not the full backlog — acceptable for demo data,
-- not worth solving here.
insert into public.demo_state (anchored_on)
select (now() at time zone 'America/Chicago')::date
where not exists (select 1 from public.demo_state);

-- refresh_demo_data() --------------------------------------------------------
-- Ages the seed data forward by however many farm-local calendar days have
-- elapsed since it was last anchored, then re-anchors to today. Run this
-- manually any time with `select public.refresh_demo_data();`.
--
-- SECURITY DEFINER + `set search_path = ''` (with fully-qualified names)
-- for the same reason as the other privileged helpers in this schema: it
-- needs to write rows (`logs`, `log_reads`) that RLS would otherwise block
-- for any role other than the row owner, and the empty search_path is the
-- standard hardening against search_path hijacking on a SECURITY DEFINER
-- function.
create function public.refresh_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today_local date := (now() at time zone 'America/Chicago')::date;
  v_anchored_on date;
  v_delta int;
  -- The seeded admin account, and the exact 5 log ids seed.sql leaves
  -- unread for it (see seed.sql's final `log_reads` insert: everything
  -- except the 4 headline logs + 1 of today's 5 logs). Hardcoded because
  -- seed.sql itself uses fixed UUIDs for these specific rows.
  v_admin_id uuid := '10000000-0000-0000-0000-000000000001';
  v_unread_log_ids uuid[] := array[
    '40000000-0000-0000-0000-000000000001', -- headline: spraying (Isaac / Field A)
    '40000000-0000-0000-0000-000000000002', -- headline: harvesting (Maya / Field B)
    '40000000-0000-0000-0000-000000000003', -- headline: planting (Liam / Field C)
    '40000000-0000-0000-0000-000000000004', -- headline: irrigating (Sophia / Field D)
    '50000000-0000-0000-0000-000000000001'  -- today: one of the 5 no-audio logs
  ]::uuid[];
begin
  select anchored_on into v_anchored_on from public.demo_state where id;

  -- No demo_state row at all (e.g. this migration hasn't seeded one, or ran
  -- against a non-demo database) -> nothing to anchor against, no-op.
  if v_anchored_on is null then
    return;
  end if;

  v_delta := v_today_local - v_anchored_on;

  if v_delta > 0 then
    -- Shift only seed-sourced logs. Real logs (source <> 'seed') are never
    -- touched, by construction of this WHERE clause.
    --
    -- Adding an integer-day interval to a timestamptz shifts by calendar
    -- days in the *session's* timezone, not the farm's. In the normal case
    -- (no DST transition inside the shifted window) this preserves the
    -- farm-local wall-clock time exactly, which is what we want. If the
    -- shift happens to cross a US DST boundary, the farm-local wall-clock
    -- time can drift by an hour for the affected rows — a cosmetic quirk
    -- of demo data, not worth compensating for here.
    update public.logs
    set started_at = started_at + make_interval(days => v_delta),
        ended_at = ended_at + make_interval(days => v_delta),
        created_at = created_at + make_interval(days => v_delta)
    where source = 'seed';

    -- Restore the demo's "new log" state: delete any read receipts that
    -- have accumulated (from admins clicking through the demo) on exactly
    -- the log ids seed.sql originally left unread, so the "1 New" /
    -- new-log badges reappear each day the same way a fresh `db reset`
    -- would produce them.
    delete from public.log_reads
    where user_id = v_admin_id
      and log_id = any(v_unread_log_ids);

    update public.demo_state set anchored_on = v_today_local where id;
  end if;
end;
$$;

-- Created with default privileges, which grants EXECUTE to PUBLIC — revoke
-- that explicitly so only the scheduled cron job (running as the function
-- owner) can invoke it; no client role should ever call this directly.
revoke execute on function public.refresh_demo_data() from public, anon, authenticated;

-- Schedule -------------------------------------------------------------------
-- 05:05 UTC is 00:05 America/Chicago during CDT (UTC-5, roughly
-- mid-March to early November, which covers most of the growing season
-- this demo depicts). During CST (UTC-6) the job instead runs at 23:05
-- the previous Central evening -- still comfortably inside the previous
-- calendar day everywhere logs are recorded, so `refresh_demo_data()`'s own
-- date math (not the cron schedule) is what actually decides how many days
-- to shift; the schedule only needs to land once during quiet hours.
--
-- Unschedule any existing job of the same name first so re-running this
-- migration (or a future migration that touches the same job) never ends
-- up with duplicate schedules. Guarded with an existence check because
-- `cron.unschedule` errors on an unknown job name rather than no-op'ing.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-demo-data') then
    perform cron.unschedule('refresh-demo-data');
  end if;
end;
$$;

select cron.schedule('refresh-demo-data', '5 5 * * *', $$select public.refresh_demo_data()$$);
