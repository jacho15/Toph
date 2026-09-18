-- ============================================================================
-- 10. Log corrections
--
-- Voice logs come from speech transcription, so the single most natural
-- correction a reviewer makes is "the transcript got the activity/field/time
-- wrong, fix it." Today admins/managers can already tag, mark-read and
-- upload-on-behalf-of a worker, but nobody can *correct* a log once it
-- exists. This migration adds that, and — because this is a compliance
-- product, not a scratchpad — makes every correction auditable rather than a
-- silent overwrite.
--
-- Two pieces:
--   1. `public.log_edits` — an append-only audit trail, one row per
--      correction, storing a column-level diff (`{column: {from, to}}`).
--   2. `public.logs.corrected_at` / `corrected_by` — a denormalized "was this
--      corrected, by whom, when" pair on the log itself, so the dashboard can
--      show a "corrected" marker without joining the audit table for every
--      row in the feed.
-- ============================================================================

-- log_edits --------------------------------------------------------------
-- `changes` is a map of `column -> {from, to}` (e.g.
-- `{"activity": {"from": "spraying", "to": "fertilizing"}}`), written by the
-- app in the same request as the `logs` update. `note` is an optional
-- free-text reason for the correction (not currently surfaced in the UI, but
-- cheap to have for a future "why was this changed" prompt).
create table public.log_edits (
  id bigint generated always as identity primary key,
  log_id uuid not null references public.logs (id) on delete cascade,
  edited_by uuid not null references public.profiles (id),
  changes jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

-- Covers "this log's edit history, newest first" — the only access pattern
-- an audit trail needs.
create index log_edits_log_id_created_at_idx on public.log_edits (log_id, created_at desc);

alter table public.log_edits enable row level security;

-- select: audit visibility follows log visibility, not farm/role directly —
-- delegating entirely via EXISTS (same pattern as `log_answers_select` in
-- 20260916120003_helpers_rls.sql) means a worker who can see their own log
-- can see its edit history too, an admin/manager sees every log's history,
-- and neither sees anything for a log they can't already see. No separate
-- farm/role check needed here since it can never drift out of sync with the
-- `logs` RLS that already encodes "who can see this log".
create policy log_edits_select on public.log_edits
  for select to authenticated
  using (
    exists (
      select 1 from public.logs l where l.id = log_edits.log_id
    )
  );

-- insert: only admin/manager, only for a log on their own farm, and only
-- recording themselves as the editor (never on someone else's behalf).
create policy log_edits_admin_manager_insert on public.log_edits
  for insert to authenticated
  with check (
    edited_by = auth.uid()
    and public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.logs l
      where l.id = log_edits.log_id and l.farm_id = public.current_farm_id()
    )
  );

-- Deliberately no update/delete policy: an audit trail is append-only. Once
-- a correction is recorded, it stays recorded — even if the log itself is
-- later corrected again (that's a *new* row, not an edit to this one).

grant select, insert on public.log_edits to authenticated;
grant usage on sequence public.log_edits_id_seq to authenticated;

-- logs: corrected_at / corrected_by -----------------------------------------
-- Denormalized off `log_edits` purely for cheap display ("corrected" marker
-- in the table without joining the audit table for every row of the feed).
-- No index: these are read alongside every other `logs` column already
-- covered by `logs_farm_started_idx`, never filtered/sorted on their own.
alter table public.logs
  add column corrected_at timestamptz,
  add column corrected_by uuid references public.profiles (id) on delete set null;

-- logs RLS: update ------------------------------------------------------------
-- Verified, not added: `logs_admin_manager_update` (20260916120003_helpers_rls.sql)
-- already permits an admin/manager to update any log on their own farm, with no
-- column restriction — so it already covers this feature's writes (the
-- corrected activity/field/time/details columns, plus corrected_at/corrected_by).
-- There is deliberately still no worker UPDATE policy on `logs` anywhere — a
-- worker can never correct a log, their own or otherwise; RLS denies it the same
-- way it already denies a worker's own attempt to edit a submitted recording.

-- log_feed: recreate with corrected_at / corrected_by --------------------
-- Same reasoning as every previous log_feed rebuild in this schema (dropped
-- and recreated, not `create or replace`, so new columns don't have to match
-- the existing column order): every existing column is kept, plus:
--   corrected_at      - when this log was last corrected (null if never)
--   corrected_by_name - the corrector's profile full_name (null if never)
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
  uploader.full_name as uploaded_by_name,
  l.corrected_at,
  l.corrected_by,
  corrector.full_name as corrected_by_name
from public.logs l
join public.profiles emp on emp.id = l.employee_id
left join public.fields f on f.id = l.field_id
left join public.profiles attributed_profile on attributed_profile.id = l.attributed_profile_id
left join public.crew_members attributed_crew on attributed_crew.id = l.attributed_crew_member_id
left join public.profiles uploader on uploader.id = l.uploaded_by
left join public.profiles corrector on corrector.id = l.corrected_by
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
