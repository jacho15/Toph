-- ============================================================================
-- 3. Helper functions + Row Level Security
-- ============================================================================

-- current_farm_id() / current_user_role() ------------------------------------
-- Every RLS policy below needs "what farm/role is the calling user in", which
-- means reading `profiles` for auth.uid(). If that read were subject to RLS
-- itself, the profiles-select policy (which also needs current_farm_id())
-- would recurse into itself. SECURITY DEFINER breaks that cycle: these two
-- functions run as their owner (bypassing RLS) and simply project a single
-- column off `profiles`, so they're safe to expose despite the elevated
-- privilege. `set search_path = ''` + fully-qualified names is the standard
-- Supabase hardening against search_path hijacking on SECURITY DEFINER
-- functions.
create function public.current_farm_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select farm_id from public.profiles where id = auth.uid();
$$;

create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_farm_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

-- Enable RLS everywhere. There is no service-role bypass built into any
-- policy below on purpose — the service role already bypasses RLS entirely,
-- so policies are written only for the `authenticated` (and, for storage,
-- also-authenticated) app-facing role.
alter table public.farms enable row level security;
alter table public.profiles enable row level security;
alter table public.fields enable row level security;
alter table public.logs enable row level security;
alter table public.log_answers enable row level security;
alter table public.tags enable row level security;
alter table public.log_tags enable row level security;
alter table public.log_reads enable row level security;

-- farms ------------------------------------------------------------------
create policy farms_select_own on public.farms
  for select to authenticated
  using (id = public.current_farm_id());

-- profiles -----------------------------------------------------------------
-- Select is farm-wide (not "self only") because the dashboard needs to show
-- employee name/avatar for every teammate's log, and the mobile app/admin UI
-- both need a farm directory. Only self-update is allowed, so nobody can
-- promote themselves to admin or edit a coworker's profile.
create policy profiles_select_same_farm on public.profiles
  for select to authenticated
  using (farm_id = public.current_farm_id());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- fields -------------------------------------------------------------------
create policy fields_select_same_farm on public.fields
  for select to authenticated
  using (farm_id = public.current_farm_id());

create policy fields_admin_manager_insert on public.fields
  for insert to authenticated
  with check (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

create policy fields_admin_manager_update on public.fields
  for update to authenticated
  using (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  )
  with check (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

-- logs -----------------------------------------------------------------------
-- Two SELECT policies (Postgres OR's multiple permissive policies for the
-- same command together): admins/managers see every log in the farm, a
-- worker sees only the logs they recorded. Workers can only INSERT their own
-- logs (employee_id must be their own uid, farm_id must match their farm) —
-- there's deliberately no worker UPDATE/DELETE policy, since a submitted
-- voice log is treated as an immutable record from the field.
create policy logs_admin_manager_select on public.logs
  for select to authenticated
  using (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

create policy logs_worker_select_own on public.logs
  for select to authenticated
  using (employee_id = auth.uid());

create policy logs_worker_insert_own on public.logs
  for insert to authenticated
  with check (
    employee_id = auth.uid()
    and farm_id = public.current_farm_id()
  );

create policy logs_admin_manager_update on public.logs
  for update to authenticated
  using (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  )
  with check (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

create policy logs_admin_manager_delete on public.logs
  for delete to authenticated
  using (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

-- log_answers ------------------------------------------------------------
-- No separate farm/role check here: whether a row is visible/insertable is
-- entirely delegated to the parent log's own RLS via EXISTS, so this table's
-- access rules can never drift out of sync with `logs`.
create policy log_answers_select on public.log_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.logs l where l.id = log_answers.log_id
    )
  );

create policy log_answers_insert on public.log_answers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.logs l where l.id = log_answers.log_id
    )
  );

-- tags / log_tags ------------------------------------------------------------
create policy tags_select_same_farm on public.tags
  for select to authenticated
  using (farm_id = public.current_farm_id());

create policy tags_admin_manager_insert on public.tags
  for insert to authenticated
  with check (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

create policy tags_admin_manager_delete on public.tags
  for delete to authenticated
  using (
    farm_id = public.current_farm_id()
    and public.current_user_role() in ('admin', 'manager')
  );

create policy log_tags_select_same_farm on public.log_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.tags t
      where t.id = log_tags.tag_id and t.farm_id = public.current_farm_id()
    )
  );

create policy log_tags_admin_manager_insert on public.log_tags
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'manager'));

create policy log_tags_admin_manager_delete on public.log_tags
  for delete to authenticated
  using (public.current_user_role() in ('admin', 'manager'));

-- log_reads --------------------------------------------------------------
-- Strictly per-user: a caller may only see/create/remove their own read
-- receipts, never mark a log read on someone else's behalf.
create policy log_reads_select_own on public.log_reads
  for select to authenticated
  using (user_id = auth.uid());

create policy log_reads_insert_own on public.log_reads
  for insert to authenticated
  with check (user_id = auth.uid());

create policy log_reads_delete_own on public.log_reads
  for delete to authenticated
  using (user_id = auth.uid());
