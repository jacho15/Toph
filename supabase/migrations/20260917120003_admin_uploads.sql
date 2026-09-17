-- ============================================================================
-- 9. Admin/manager uploads on the crew's behalf
--
-- Owner's reversal of the previous "recording is workers only" decision: field
-- workers only ever use their own phone app, so the valuable case is an
-- *admin uploading clips on the crew's behalf*, with spoken-name matching
-- deciding who each clip belongs to. This migration adds the column and RLS
-- needed for that, on top of the spoken-name attribution added in
-- 20260917120001_person_attribution.sql.
--
-- Ownership semantics after this migration:
--   - `employee_id` = the person the work belongs to (when they have a
--     profile); `uploaded_by` = who actually submitted the clip.
--   - worker recording themselves               -> employee_id = uploaded_by = auth.uid()
--   - admin upload matched to a worker profile   -> employee_id = that worker, uploaded_by = admin
--   - admin upload matched to a crew member with
--     no login                                   -> employee_id = uploaded_by = admin,
--                                                    attributed_crew_member_id = the crew member
--                                                    (so display_name, via the existing
--                                                    coalesce(attributed_name, employee_name),
--                                                    shows the crew member instead of the admin)
--   Note: the storage insert policy (`recordings_insert_own`, migration 5) requires the
--   object path's second folder to equal `auth.uid()`, so an uploaded clip's audio always
--   lands under the *uploader's* folder (`<farm_id>/<uploaded_by>/...`), never the
--   attributed worker's — the app resolves attribution after upload, not before.
-- ============================================================================

-- logs.uploaded_by ------------------------------------------------------------
alter table public.logs
  add column uploaded_by uuid references public.profiles (id) on delete set null;

-- Backfill: every existing row was self-recorded, so the uploader is the same
-- person as employee_id.
update public.logs set uploaded_by = employee_id where uploaded_by is null;

create index logs_uploaded_by_idx on public.logs (uploaded_by);

-- logs: admin/manager insert --------------------------------------------------
-- Workers keep their existing `logs_worker_insert_own` policy untouched (a worker still
-- cannot file a log for someone else — employee_id must equal their own uid). This adds a
-- second, additive path for admin/manager: they may insert a log for any *active profile on
-- their own farm* (employee_id doesn't have to be their own uid), but still only within their
-- farm and only while holding an admin/manager role.
create policy logs_admin_manager_insert on public.logs
  for insert to authenticated
  with check (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.profiles p
      where p.id = employee_id and p.farm_id = public.current_farm_id()
    )
  );

-- log_answers: no change needed -----------------------------------------------
-- `log_answers_insert` (migration 3) delegates entirely to "does a log with this id exist"
-- via EXISTS, with no farm/role check of its own — so it passes for an admin-inserted log
-- exactly the same as a worker-inserted one, with no additional policy required here.

-- log_feed: recreate with uploaded_by -----------------------------------------
-- Same reasoning as 20260917120001's rebuild: dropped and recreated (rather than
-- `create or replace`) so the new columns can be added without worrying about matching the
-- existing column order. Every existing column is kept, plus:
--   uploaded_by      - who submitted the clip (see ownership semantics above)
--   uploaded_by_name - that uploader's profile full_name
-- `display_name` is unchanged: coalesce(attributed_name, employee_name).
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
  coalesce(attributed_profile.full_name, attributed_crew.full_name, emp.full_name) as display_name,
  l.uploaded_by,
  uploader.full_name as uploaded_by_name
from public.logs l
join public.profiles emp on emp.id = l.employee_id
left join public.fields f on f.id = l.field_id
left join public.profiles attributed_profile on attributed_profile.id = l.attributed_profile_id
left join public.crew_members attributed_crew on attributed_crew.id = l.attributed_crew_member_id
left join public.profiles uploader on uploader.id = l.uploaded_by
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
