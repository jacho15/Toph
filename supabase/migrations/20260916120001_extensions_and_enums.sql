-- ============================================================================
-- 1. Extensions + enums
-- ============================================================================

-- postgis is installed into its own `extensions` schema (Supabase convention)
-- rather than `public`, so the extension's ~1000 functions/operators don't
-- clutter the exposed API schema or `\d` output on public tables. All
-- geography columns are declared as `extensions.geography(...)`.
create extension if not exists postgis with schema extensions;

-- user_role backs both `profiles.role` and the RLS policies that branch on
-- "is this caller an admin/manager (farm-wide) or a worker (own rows only)".
-- An enum (vs. free text) means bad roles are rejected by the type system,
-- not by app-layer validation, and comparisons are a cheap int-like check.
create type public.user_role as enum ('admin', 'manager', 'worker');

-- activity_type mirrors the closed set of choices the mobile app's guided
-- question ("What type of activity was this?") offers. Keeping it an enum
-- (vs. text) prevents label drift ("Spraying" vs "spray" vs "Spray ") that
-- would otherwise silently break dashboard grouping/filtering by activity.
create type public.activity_type as enum (
  'spraying',
  'fertilizing',
  'planting',
  'irrigating',
  'harvesting',
  'scouting',
  'pruning',
  'soil_work',
  'equipment_maintenance'
);
