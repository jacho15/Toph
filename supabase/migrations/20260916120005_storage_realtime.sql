-- ============================================================================
-- 5. Storage + realtime
-- ============================================================================

-- recordings bucket ----------------------------------------------------------
-- Private (public = false): audio is only ever served via signed URLs
-- requested by an authorized dashboard/mobile session, never a public link.
-- allowed_mime_types matches the formats mobile recorders actually produce
-- (m4a/mp4 on iOS, webm on some Android/web capture paths) plus a few common
-- fallbacks; file_size_limit (20MB) is generous for a voice-note-length clip
-- while still bounding worst-case storage/bandwidth abuse.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  20971520,
  array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg']
)
on conflict do nothing;

-- Objects are keyed as `<farm_id>/<employee_id>/<log_id>.<ext>`, so the farm
-- and uploader are recoverable straight from the storage path via
-- storage.foldername() without a join back to `logs` — cheap enough to
-- evaluate per-request in a storage policy.
create policy recordings_select_same_farm on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = public.current_farm_id()::text
  );

create policy recordings_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = public.current_farm_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Realtime ---------------------------------------------------------------
-- Only the tables the dashboard needs to live-update on are published: new
-- logs arriving, tags being added/removed, and read-state changes (for the
-- "N New" badge to drop in real time as another admin reads a log).
-- log_answers/tags/fields/profiles don't need push updates for this UI.
alter publication supabase_realtime add table public.logs, public.log_tags, public.log_reads;
