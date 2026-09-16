-- ============================================================================
-- 7. AI spend limits
--
-- The voice-log pipeline calls claude-opus-5 (~$0.024/call at typical
-- token counts). Without a cap, a broken client loop or a malicious caller
-- could run up an unbounded Anthropic bill. This migration adds the
-- accounting + enforcement tables/functions the app checks before every
-- extraction call:
--   - per-IP: $1.00 spent in the trailing 60 minutes
--   - global: $10.00 spent in the current UTC calendar month, across everyone
-- ============================================================================

-- ai_limits ------------------------------------------------------------------
-- Single-row config table (the `id boolean primary key default true check
-- (id)` trick used elsewhere in this schema for demo_state/refresh_demo_data
-- makes a second row impossible), so the limits can be tuned with a plain
-- UPDATE instead of a deploy. RLS is enabled with no policies at all, which
-- denies every row to `anon`/`authenticated` unconditionally — only the
-- functions below (SECURITY DEFINER, service_role only) ever read it.
create table public.ai_limits (
  id boolean primary key default true check (id),
  ip_hourly_usd numeric(10,4) not null default 1.00,
  global_monthly_usd numeric(10,4) not null default 10.00,
  updated_at timestamptz not null default now()
);

insert into public.ai_limits (id) values (true);

-- ai_usage ---------------------------------------------------------------
-- One row per extraction call (successful or not, as long as tokens were
-- actually spent). `ip_hash` (never the raw IP) is what the budget checks
-- key off; `user_id` is kept for auditing/debugging only and is nulled out
-- (not cascaded) if the account is later deleted, so historical spend
-- records survive account deletion. `cost_usd <= 5` is a sanity ceiling —
-- a single voice-log extraction should never legitimately cost anywhere
-- near that, so a row over it almost certainly means a pricing/usage bug
-- upstream, and the check constraint catches it at insert time instead of
-- silently corrupting the spend totals.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  user_id uuid references auth.users (id) on delete set null,
  feature text not null default 'voice_log',
  model text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cache_read_input_tokens int not null default 0 check (cache_read_input_tokens >= 0),
  cache_creation_input_tokens int not null default 0 check (cache_creation_input_tokens >= 0),
  cost_usd numeric(12,6) not null check (cost_usd >= 0 and cost_usd <= 5),
  created_at timestamptz not null default now()
);

-- Covers the two access patterns the budget check needs: "this IP's spend
-- in the trailing window" and "everyone's spend so far this month".
create index ai_usage_ip_hash_created_at_idx on public.ai_usage (ip_hash, created_at desc);
create index ai_usage_created_at_idx on public.ai_usage (created_at);

alter table public.ai_limits enable row level security;
alter table public.ai_usage enable row level security;

-- Belt-and-suspenders on top of "RLS enabled, no policies": explicitly
-- revoke the table privileges Supabase's default grants would otherwise
-- hand to `anon`/`authenticated`, so there is no privilege for a future
-- permissive policy to accidentally light up.
revoke all on public.ai_usage, public.ai_limits from anon, authenticated;

-- ai_budget_check() --------------------------------------------------------
-- SECURITY DEFINER so it can read ai_limits/ai_usage despite those tables
-- having no policies for anyone. `pg_advisory_xact_lock` on a hash of the
-- IP serializes concurrent budget checks for the *same* IP within a
-- transaction (so two requests racing right at the limit can't both read
-- "under budget" and both proceed) without taking a table-wide lock that
-- would serialize unrelated IPs against each other.
create function public.ai_budget_check(p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits public.ai_limits%rowtype;
  v_ip_spent_hour numeric(12,6);
  v_global_spent_month numeric(12,6);
  v_month_start timestamptz;
  v_oldest_in_window timestamptz;
  v_retry_after_seconds int;
  v_allowed boolean := true;
  v_reason text := null;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_budget:' || p_ip_hash, 0));

  select * into v_limits from public.ai_limits where id;

  select coalesce(sum(cost_usd), 0), min(created_at)
  into v_ip_spent_hour, v_oldest_in_window
  from public.ai_usage
  where ip_hash = p_ip_hash and created_at >= now() - interval '60 minutes';

  v_month_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  select coalesce(sum(cost_usd), 0) into v_global_spent_month
  from public.ai_usage
  where created_at >= v_month_start;

  if v_ip_spent_hour >= v_limits.ip_hourly_usd then
    v_allowed := false;
    v_reason := 'ip_hourly';
    -- Approximate: allowed again once the oldest in-window row ages past
    -- the 60-minute mark, freeing up its cost from the rolling sum.
    v_retry_after_seconds := greatest(
      0,
      ceil(extract(epoch from ((v_oldest_in_window + interval '60 minutes') - now())))::int
    );
  elsif v_global_spent_month >= v_limits.global_monthly_usd then
    v_allowed := false;
    v_reason := 'global_monthly';
    v_retry_after_seconds := greatest(
      0,
      ceil(extract(epoch from (
        (v_month_start + interval '1 month') - now()
      )))::int
    );
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'ip_spent_hour', v_ip_spent_hour,
    'ip_limit', v_limits.ip_hourly_usd,
    'global_spent_month', v_global_spent_month,
    'global_limit', v_limits.global_monthly_usd,
    'retry_after_seconds', v_retry_after_seconds
  );
end;
$$;

-- ai_usage_record() ---------------------------------------------------------
-- SECURITY DEFINER, same reasoning as ai_budget_check. Validates its inputs
-- itself (rather than trusting the caller) since it's the only write path
-- into ai_usage and a bad row here would corrupt every future budget check.
create function public.ai_usage_record(
  p_ip_hash text,
  p_user_id uuid,
  p_feature text,
  p_model text,
  p_input int,
  p_output int,
  p_cache_read int,
  p_cache_write int,
  p_cost numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ip_hash is null or length(trim(p_ip_hash)) = 0 then
    raise exception 'ai_usage_record: p_ip_hash is required';
  end if;
  if p_feature is null or length(trim(p_feature)) = 0 then
    raise exception 'ai_usage_record: p_feature is required';
  end if;
  if p_model is null or length(trim(p_model)) = 0 then
    raise exception 'ai_usage_record: p_model is required';
  end if;
  if p_cost is null or p_cost < 0 then
    raise exception 'ai_usage_record: p_cost must be >= 0';
  end if;

  insert into public.ai_usage (
    ip_hash, user_id, feature, model,
    input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens,
    cost_usd
  ) values (
    p_ip_hash, p_user_id, p_feature, p_model,
    greatest(coalesce(p_input, 0), 0),
    greatest(coalesce(p_output, 0), 0),
    greatest(coalesce(p_cache_read, 0), 0),
    greatest(coalesce(p_cache_write, 0), 0),
    p_cost
  );
end;
$$;

-- Execute permissions --------------------------------------------------------
-- Both functions are SECURITY DEFINER and bypass RLS internally, so who can
-- call them *is* the access control. If `authenticated` could call
-- ai_usage_record, anyone signed in with the public demo login could insert
-- fake spend rows and drive the global monthly total over the cap, locking
-- out every other farm on the account (a denial-of-service via the budget
-- limiter itself). Budget accounting therefore only runs through the
-- Next.js server using the service role key — never from a browser session.
revoke execute on function public.ai_budget_check(text) from public, anon, authenticated;
revoke execute on function public.ai_usage_record(text, uuid, text, text, int, int, int, int, numeric) from public, anon, authenticated;
grant execute on function public.ai_budget_check(text) to service_role;
grant execute on function public.ai_usage_record(text, uuid, text, text, int, int, int, int, numeric) to service_role;

-- Orphan audio cleanup ------------------------------------------------------
-- `createVoiceLog`'s best-effort cleanup (`supabase.storage.from("recordings")
-- .remove(...)`) runs as the uploading user, but there was previously no
-- DELETE policy on storage.objects at all, so that cleanup silently failed
-- and left orphaned audio behind on any failed save (including the new
-- budget-denied path). This policy lets a user delete only their own,
-- unreferenced object — never one a `logs` row still points to, so nobody
-- can delete evidence attached to a submitted log.
create policy recordings_delete_own_unreferenced on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = public.current_farm_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and owner_id = auth.uid()::text
    and not exists (
      select 1 from public.logs l where l.audio_path = name
    )
  );
