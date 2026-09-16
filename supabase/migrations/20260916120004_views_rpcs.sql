-- ============================================================================
-- 4. Views + RPCs
-- ============================================================================

-- log_feed ---------------------------------------------------------------
-- The single read model the dashboard table/expandable-row UI is built on:
-- one row per log, pre-joined with employee, field (+ GeoJSON boundary for
-- the satellite map), tags, and answers, plus a per-caller `is_new` flag.
-- `security_invoker = true` means the view carries NO privilege of its own —
-- it runs with the querying user's row visibility, so it automatically
-- inherits the `logs`/`fields`/`profiles` RLS policies from migration 3
-- (admin/manager see the whole farm, a worker sees only their own logs)
-- without duplicating any of that logic here.
create view public.log_feed
with (security_invoker = true) as
select
  l.id,
  l.farm_id,
  l.employee_id,
  emp.full_name as employee_name,
  emp.avatar_url as employee_avatar_url,
  l.field_id,
  f.name as field_name,
  f.crop as field_crop,
  case when f.boundary is null then null
       else extensions.ST_AsGeoJSON(f.boundary)::jsonb end as field_boundary,
  l.activity,
  l.started_at,
  l.ended_at,
  l.audio_path,
  l.audio_mime,
  l.duration_s,
  l.waveform_peaks,
  l.transcript,
  l.summary,
  l.details,
  case when l.location is null then null
       else extensions.ST_AsGeoJSON(l.location)::jsonb end as location_geojson,
  l.source,
  l.created_at,
  coalesce(tag_agg.tags, '[]'::jsonb) as tags,
  coalesce(answer_agg.answers, '[]'::jsonb) as answers,
  not exists (
    select 1 from public.log_reads lr
    where lr.log_id = l.id and lr.user_id = auth.uid()
  ) as is_new
from public.logs l
join public.profiles emp on emp.id = l.employee_id
left join public.fields f on f.id = l.field_id
-- LATERAL + jsonb_agg (rather than a GROUP BY over the joins) so tags and
-- answers each aggregate independently and never cross-multiply each other.
left join lateral (
  select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) as tags
  from public.log_tags lt
  join public.tags t on t.id = lt.tag_id
  where lt.log_id = l.id
) tag_agg on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object(
             'id', a.id,
             'position', a."position",
             'question_key', a.question_key,
             'question', a.question,
             'answer', a.answer,
             'is_valid', a.is_valid
           )
           order by a."position"
         ) as answers
  from public.log_answers a
  where a.log_id = l.id
) answer_agg on true;

grant select on public.log_feed to authenticated;

-- dashboard_stats() ------------------------------------------------------
-- SECURITY INVOKER (the default, made explicit): stats are computed under
-- the caller's own RLS, so an admin gets farm-wide numbers while a worker
-- calling the same function gets numbers scoped to what RLS lets them see
-- (their own logs) — one function, correct for every role, no branching on
-- current_user_role() needed inside it.
--
-- "Today" is evaluated in the farm's own timezone (not UTC and not the
-- server's timezone), since a 6am recording in America/Chicago must count
-- as "today" even when it's already tomorrow in UTC.
create function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_farm_id uuid := public.current_farm_id();
  v_tz text;
  v_todays_recordings bigint;
  v_todays_new bigint;
  v_active_workers bigint;
  v_response_accuracy numeric;
  v_new_logs_total bigint;
begin
  select coalesce(f.timezone, 'America/Chicago') into v_tz
  from public.farms f where f.id = v_farm_id;

  select count(*) into v_todays_recordings
  from public.logs l
  where l.farm_id = v_farm_id
    and (l.started_at at time zone v_tz)::date = (now() at time zone v_tz)::date;

  select count(*) into v_todays_new
  from public.logs l
  where l.farm_id = v_farm_id
    and (l.started_at at time zone v_tz)::date = (now() at time zone v_tz)::date
    and not exists (
      select 1 from public.log_reads lr
      where lr.log_id = l.id and lr.user_id = auth.uid()
    );

  select count(*) into v_active_workers
  from public.profiles p
  where p.farm_id = v_farm_id and p.role = 'worker' and p.is_active = true;

  select round(100.0 * count(*) filter (where a.is_valid) / nullif(count(*), 0))
  into v_response_accuracy
  from public.log_answers a
  join public.logs l on l.id = a.log_id
  where l.farm_id = v_farm_id
    and l.started_at >= now() - interval '30 days';

  select count(*) into v_new_logs_total
  from public.logs l
  where l.farm_id = v_farm_id
    and not exists (
      select 1 from public.log_reads lr
      where lr.log_id = l.id and lr.user_id = auth.uid()
    );

  return jsonb_build_object(
    'todays_recordings', v_todays_recordings,
    'todays_new', v_todays_new,
    'active_workers', v_active_workers,
    'response_accuracy', v_response_accuracy,
    'new_logs_total', v_new_logs_total
  );
end;
$$;

grant execute on function public.dashboard_stats() to authenticated;

-- mark_logs_read() -------------------------------------------------------
-- `on conflict do nothing` makes this idempotent (re-opening a row already
-- marked read is a no-op, not an error), and it always writes for auth.uid()
-- regardless of what's passed in, so a caller can never mark logs read on
-- someone else's behalf.
create function public.mark_logs_read(p_log_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.log_reads (log_id, user_id)
  select log_id, auth.uid()
  from unnest(p_log_ids) as log_id
  on conflict do nothing;
$$;

grant execute on function public.mark_logs_read(uuid[]) to authenticated;
