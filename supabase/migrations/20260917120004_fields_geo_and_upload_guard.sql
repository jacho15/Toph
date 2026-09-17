-- Two small hardening changes.
--
-- 1. `public.fields_geo` — the /map page needs every field's polygon, for every role.
--
--    `fields.boundary` is a PostGIS `geography` column, and PostgREST returns it as
--    hex-encoded EWKB, not GeoJSON, so the app had to decode the binary itself. The
--    per-log `log_feed.field_boundary` already carries an ST_AsGeoJSON cast, but that
--    view is scoped to logs the viewer may see, so a worker who had never recorded in a
--    field would see no polygon for it. This view exposes the cast once, farm-wide, and
--    inherits `fields` RLS through `security_invoker`.
--
-- 2. `logs_admin_manager_insert` also pins `uploaded_by` to the caller.
--
--    The policy already restricted which farm and which `employee_id` an admin may file
--    for, but `uploaded_by` was enforced only in the server action. Since that column is
--    the audit trail for "who filed this log for someone else", the database should be
--    the one guaranteeing it rather than trusting application code.

create or replace view public.fields_geo
with (security_invoker = true) as
select
  f.id,
  f.farm_id,
  f.name,
  f.crop,
  f.acres,
  extensions.ST_AsGeoJSON(f.boundary)::jsonb as boundary_geojson,
  extensions.ST_AsGeoJSON(f.centroid)::jsonb as centroid_geojson
from public.fields f;

grant select on public.fields_geo to authenticated;

drop policy if exists logs_admin_manager_insert on public.logs;

create policy logs_admin_manager_insert on public.logs
  for insert to authenticated
  with check (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
    -- the work is filed against a profile on the caller's own farm
    and exists (
      select 1 from public.profiles p
      where p.id = employee_id and p.farm_id = public.current_farm_id()
    )
    -- and the audit trail always names the caller, never someone else
    and uploaded_by = auth.uid()
  );
