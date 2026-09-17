import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatActivityLabel } from "@/lib/format";
import type { ActivityType, Tag } from "@/lib/types";

const ALL_ACTIVITIES: ActivityType[] = [
  "spraying",
  "fertilizing",
  "planting",
  "irrigating",
  "harvesting",
  "scouting",
  "pruning",
  "soil_work",
  "equipment_maintenance",
];

/**
 * Data access for the /activity-logs and /map pages. Kept separate from lib/data.ts (owned by a
 * concurrent change) so this file can evolve independently.
 */

const PAGE_SIZE = 25;

export type ActivityLogsSortField = "date" | "employee" | "activity" | "field";
export type ActivityLogsSortDir = "asc" | "desc";

export type ActivityLogsFilters = {
  q?: string;
  activity?: ActivityType[];
  /** field_name values. */
  field?: string[];
  /** Inclusive lower bound on started_at, as a YYYY-MM-DD date. */
  from?: string;
  /** Inclusive upper bound on started_at, as a YYYY-MM-DD date. */
  to?: string;
  sort?: ActivityLogsSortField;
  dir?: ActivityLogsSortDir;
  /** 1-based. */
  page?: number;
};

export type ActivityLogRow = {
  id: string;
  employee_name: string;
  activity: ActivityType;
  started_at: string;
  ended_at: string | null;
  field_name: string | null;
  duration_s: number | null;
  tags: Tag[];
};

export type ActivityLogsPage = {
  rows: ActivityLogRow[];
  count: number;
  page: number;
  pageSize: number;
};

const SORT_COLUMNS: Record<ActivityLogsSortField, string> = {
  date: "started_at",
  employee: "employee_name",
  // This local PostgREST doesn't support `column::type` casts in `order=`, so sorting by activity
  // follows the activity_type enum's declaration order (spraying, fertilizing, planting, ...)
  // rather than the alphabetical display label.
  activity: "activity",
  field: "field_name",
};

/**
 * The full-history Activity Logs view. This is the "all time" table and can grow large, so every
 * filter, the sort, and the pagination are pushed down into the `log_feed` query (ilike/in/gte/
 * lte/order/range, with an exact count) rather than fetched in full and filtered in JS the way the
 * dashboard's small LogsTable does. `log_feed` has `security_invoker = true`, so this automatically
 * respects the caller's RLS (admins/managers see the whole farm, a worker sees only their own logs).
 */
export async function getActivityLogsPage(filters: ActivityLogsFilters): Promise<ActivityLogsPage> {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const sort = filters.sort ?? "date";
  const dir = filters.dir ?? (sort === "date" ? "desc" : "asc");

  let query = supabase
    .from("log_feed")
    .select("id, employee_name, activity, started_at, ended_at, field_name, duration_s, tags", {
      count: "exact",
    });

  const q = filters.q?.trim();
  if (q) {
    const needle = `%${q}%`;
    // This local PostgREST doesn't support `column::type` casts inside `or=`, so activity can't be
    // ilike'd directly (it's an enum). Instead, match q against the fixed activity list in JS (by
    // both its raw value and its display label) and fold any hits into an `activity.in.(...)`
    // branch of the same OR.
    const lowered = q.toLowerCase();
    const matchingActivities = ALL_ACTIVITIES.filter(
      (activity) => activity.includes(lowered) || formatActivityLabel(activity).toLowerCase().includes(lowered)
    );
    const orParts = [`employee_name.ilike.${needle}`, `field_name.ilike.${needle}`];
    if (matchingActivities.length > 0) {
      orParts.push(`activity.in.(${matchingActivities.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  if (filters.activity && filters.activity.length > 0) {
    query = query.in("activity", filters.activity);
  }

  if (filters.field && filters.field.length > 0) {
    query = query.in("field_name", filters.field);
  }

  // Date-only strings are treated as whole UTC-day bounds. This is an approximation of the farm's
  // America/Chicago day (display formatting always goes through lib/format.ts, which does use the
  // farm timezone) — acceptable for a coarse date-range filter.
  if (filters.from) {
    query = query.gte("started_at", `${filters.from}T00:00:00.000Z`);
  }
  if (filters.to) {
    query = query.lte("started_at", `${filters.to}T23:59:59.999Z`);
  }

  query = query.order(SORT_COLUMNS[sort], { ascending: dir === "asc" });

  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;
  query = query.range(rangeFrom, rangeTo);

  const { data, error, count } = await query;
  if (error || !data) {
    return { rows: [], count: 0, page, pageSize: PAGE_SIZE };
  }

  const rows: ActivityLogRow[] = data.map((row) => ({
    id: row.id ?? "",
    employee_name: row.employee_name ?? "Unknown",
    activity: (row.activity ?? "scouting") as ActivityType,
    started_at: row.started_at ?? new Date(0).toISOString(),
    ended_at: row.ended_at,
    field_name: row.field_name,
    duration_s: row.duration_s,
    tags: (row.tags as Tag[] | null) ?? [],
  }));

  return { rows, count: count ?? 0, page, pageSize: PAGE_SIZE };
}

/** Distinct field names for the Activity Logs "Field" filter select, farm-scoped by RLS. */
export async function getFieldNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fields").select("name").order("name");
  if (error || !data) return [];
  return data.map((row) => row.name);
}

export type FarmField = {
  id: string;
  name: string;
  crop: string | null;
  acres: number | null;
  boundary: GeoJSON.Polygon | null;
  recentLogCount: number;
};

export type RecentLogLocation = {
  id: string;
  employee_name: string;
  activity: ActivityType;
  started_at: string;
  field_name: string | null;
  location: GeoJSON.Point;
};

export type FarmMapData = {
  fields: FarmField[];
  locations: RecentLogLocation[];
};

const RECENT_LOCATION_LIMIT = 200;
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Fields (with boundary + acreage) and recent log locations for the /map page.
 *
 * The recent-log-count-per-field tally is a small in-memory reduce over a filtered, SQL-side query
 * (gte on started_at, limited to farm-scoped rows by RLS) — there are only a handful of fields, so
 * this isn't the "large table" case the Activity Logs page has to avoid.
 */
export async function getFarmMapData(): Promise<FarmMapData> {
  const supabase = await createClient();
  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();

  const [fieldsResult, recentFieldIdsResult, locationsResult] = await Promise.all([
    // `fields_geo` is a view over `fields` that casts the PostGIS geography columns with
    // ST_AsGeoJSON, so the app never has to decode PostGIS binary itself. It uses
    // security_invoker, so it inherits `fields` RLS (farm-wide for every role).
    supabase.from("fields_geo").select("id, name, crop, acres, boundary_geojson").order("name"),
    supabase.from("log_feed").select("field_id").not("field_id", "is", null).gte("started_at", since),
    supabase
      .from("log_feed")
      .select("id, employee_name, activity, started_at, field_name, location_geojson")
      .not("location_geojson", "is", null)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(RECENT_LOCATION_LIMIT),
  ]);

  const recentCountByField = new Map<string, number>();
  for (const row of recentFieldIdsResult.data ?? []) {
    if (!row.field_id) continue;
    recentCountByField.set(row.field_id, (recentCountByField.get(row.field_id) ?? 0) + 1);
  }

  // Columns of a view are typed nullable by `supabase gen types`, so narrow the rows that
  // matter (id/name are NOT NULL on the underlying table) before mapping.
  const fields: FarmField[] = (fieldsResult.data ?? [])
    .filter((row): row is typeof row & { id: string; name: string } =>
      Boolean(row.id) && Boolean(row.name)
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      crop: row.crop,
      acres: row.acres,
      boundary: (row.boundary_geojson as GeoJSON.Polygon | null) ?? null,
      recentLogCount: recentCountByField.get(row.id) ?? 0,
    }));

  const locations: RecentLogLocation[] = (locationsResult.data ?? [])
    .filter(
      (row): row is typeof row & { id: string; location_geojson: object } =>
        Boolean(row.id) && Boolean(row.location_geojson)
    )
    .map((row) => ({
      id: row.id,
      employee_name: row.employee_name ?? "Unknown",
      activity: (row.activity ?? "scouting") as ActivityType,
      started_at: row.started_at ?? new Date(0).toISOString(),
      field_name: row.field_name,
      location: row.location_geojson as unknown as GeoJSON.Point,
    }));

  return { fields, locations };
}
