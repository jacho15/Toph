-- ============================================================================
-- 8. Spoken-name attribution
--
-- `/record` always saves a log under the signed-in worker's own employee_id
-- (they recorded it), but the worker's guided answers can name someone else
-- ("This is Isaac, spraying Field A"). This migration adds a place to record
-- who the log is actually *for* (an existing profile, an existing crew
-- member, or a brand-new crew member), separate from who recorded it.
-- ============================================================================

-- pg_trgm --------------------------------------------------------------------
-- Backs match_person_by_name()'s fuzzy name matching (trigram similarity),
-- so "Isaac" / "Zaic" / "Isaac Wang" all match the profile "Isaac Wang"
-- without an exact-string match. Installed into `extensions`, same
-- convention as postgis in migration 1.
create extension if not exists pg_trgm with schema extensions;

-- crew_members -----------------------------------------------------------
-- A person who works on the farm but has no login yet (seasonal help), so a
-- voice log can be attributed to them without creating an auth user. Rows
-- are added on the fly from the record flow ("Add <spoken_name> as a new
-- crew member") or by an admin/manager later.
create table public.crew_members (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 80),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per farm, same convention as tags_farm_name_lower_idx,
-- so "Isaac" and "isaac" can't both be added as separate crew members.
create unique index crew_members_farm_name_lower_idx on public.crew_members (farm_id, lower(full_name));

alter table public.crew_members enable row level security;

create policy crew_members_select_same_farm on public.crew_members
  for select to authenticated
  using (farm_id = public.current_farm_id());

create policy crew_members_insert_same_farm on public.crew_members
  for insert to authenticated
  with check (
    farm_id = public.current_farm_id()
    and created_by = auth.uid()
  );

create policy crew_members_admin_manager_update on public.crew_members
  for update to authenticated
  using (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  )
  with check (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

create policy crew_members_admin_manager_delete on public.crew_members
  for delete to authenticated
  using (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

-- logs: who the work was for ------------------------------------------------
-- `employee_id` (existing column) stays "who recorded it". These new columns
-- record who the log is *for*, when a spoken name resolved to a person:
-- at most one of the two is ever set (a log is attributed to a profile OR a
-- crew member, never both), enforced below rather than left to app code.
alter table public.logs
  add column spoken_name text,
  add column attributed_profile_id uuid references public.profiles (id) on delete set null,
  add column attributed_crew_member_id uuid references public.crew_members (id) on delete set null;

alter table public.logs
  add constraint logs_single_attribution check (
    attributed_profile_id is null or attributed_crew_member_id is null
  );

create index logs_attributed_profile_idx on public.logs (attributed_profile_id);

-- log_feed: recreate with attribution columns ---------------------------
-- Dropped and recreated (rather than `create or replace`) so the new
-- columns can be added without worrying about matching the existing
-- column order. Every existing column is kept as-is, plus:
--   spoken_name              - the name the worker spoke, verbatim
--   attributed_profile_id    - set when attributed to an existing profile
--   attributed_crew_member_id - set when attributed to a crew member
--   attributed_name          - the resolved person's name, or null
--   display_name             - who the log is *for* (falls back to the recorder)
-- `employee_name` keeps its existing meaning: who recorded it.
drop view if exists public.log_feed;

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
  ) as is_new,
  l.spoken_name,
  l.attributed_profile_id,
  l.attributed_crew_member_id,
  coalesce(attributed_profile.full_name, attributed_crew.full_name) as attributed_name,
  coalesce(attributed_profile.full_name, attributed_crew.full_name, emp.full_name) as display_name
from public.logs l
join public.profiles emp on emp.id = l.employee_id
left join public.fields f on f.id = l.field_id
left join public.profiles attributed_profile on attributed_profile.id = l.attributed_profile_id
left join public.crew_members attributed_crew on attributed_crew.id = l.attributed_crew_member_id
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

-- match_person_by_name() --------------------------------------------------
-- Given a spoken name, finds candidate people on the caller's own farm
-- (active profiles and crew members) by trigram similarity against both the
-- full name and its first token (so "Isaac" matches "Isaac Wang"). SECURITY
-- DEFINER so it can read across the farm's profiles/crew_members under one
-- consistent scope check (current_farm_id()) regardless of the caller's
-- normal row-level visibility; `set search_path = ''` is the standard
-- Supabase hardening for SECURITY DEFINER functions.
create function public.match_person_by_name(p_name text)
returns table (
  kind text,
  id uuid,
  full_name text,
  score real,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select kind, id, full_name, score, is_self
  from (
    select
      'profile'::text as kind,
      p.id,
      p.full_name,
      greatest(
        extensions.similarity(lower(p.full_name), lower(p_name)),
        extensions.similarity(lower(split_part(p.full_name, ' ', 1)), lower(p_name))
      ) as score,
      p.id = auth.uid() as is_self
    from public.profiles p
    where p.farm_id = public.current_farm_id()
      and p.is_active = true

    union all

    select
      'crew'::text as kind,
      c.id,
      c.full_name,
      greatest(
        extensions.similarity(lower(c.full_name), lower(p_name)),
        extensions.similarity(lower(split_part(c.full_name, ' ', 1)), lower(p_name))
      ) as score,
      false as is_self
    from public.crew_members c
    where c.farm_id = public.current_farm_id()
  ) candidates
  where score >= 0.35
  order by score desc
  limit 5;
$$;

revoke execute on function public.match_person_by_name(text) from public, anon;
grant execute on function public.match_person_by_name(text) to authenticated;
