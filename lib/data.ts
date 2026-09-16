import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DashboardStats, LogAnswer, LogFeedRow, Tag, Viewer } from "@/lib/types";

/** Maps a `log_feed` view row (all columns nullable per the generated types) to the app's `LogFeedRow` contract. */
function mapLogFeedRow(row: {
  id: string | null;
  farm_id: string | null;
  employee_id: string | null;
  employee_name: string | null;
  employee_avatar_url: string | null;
  field_id: string | null;
  field_name: string | null;
  field_crop: string | null;
  activity: string | null;
  started_at: string | null;
  ended_at: string | null;
  audio_path: string | null;
  audio_mime: string | null;
  duration_s: number | null;
  waveform_peaks: unknown;
  transcript: string | null;
  summary: string | null;
  details: unknown;
  field_boundary: unknown;
  location_geojson: unknown;
  tags: unknown;
  answers: unknown;
  is_new: boolean | null;
  created_at: string | null;
}): LogFeedRow {
  return {
    id: row.id ?? "",
    farm_id: row.farm_id ?? "",
    employee_id: row.employee_id ?? "",
    employee_name: row.employee_name ?? "Unknown",
    employee_avatar_url: row.employee_avatar_url,
    field_id: row.field_id,
    field_name: row.field_name,
    crop: row.field_crop,
    activity: (row.activity ?? "scouting") as LogFeedRow["activity"],
    started_at: row.started_at ?? new Date(0).toISOString(),
    ended_at: row.ended_at,
    audio_path: row.audio_path,
    audio_mime: row.audio_mime,
    duration_s: row.duration_s,
    waveform_peaks: (row.waveform_peaks as number[] | null) ?? null,
    transcript: row.transcript,
    summary: row.summary,
    details: (row.details as Record<string, unknown> | null) ?? {},
    field_boundary: (row.field_boundary as GeoJSON.Polygon | null) ?? null,
    location_geojson: (row.location_geojson as GeoJSON.Point | null) ?? null,
    tags: (row.tags as Tag[] | null) ?? [],
    answers: (row.answers as LogAnswer[] | null) ?? [],
    is_new: row.is_new ?? false,
    created_at: row.created_at ?? row.started_at ?? new Date(0).toISOString(),
  };
}

/** Current authenticated user's profile. Signs out and redirects to /login if the session has no matching profile row. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url, email")
    .eq("id", userId)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return {
    id: profile.id,
    full_name: profile.full_name,
    role: profile.role,
    avatar_url: profile.avatar_url,
    email: profile.email ?? undefined,
  };
});

export const getDashboardStats = cache(async (): Promise<DashboardStats> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_stats");
  if (error || !data) {
    return { todays_recordings: 0, todays_new: 0, active_workers: 0, response_accuracy: null, new_logs_total: 0 };
  }
  return data as unknown as DashboardStats;
});

export const getLogFeed = cache(async (): Promise<LogFeedRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_feed")
    .select("*")
    .order("started_at", { ascending: false });

  if (error || !data) return [];
  return data.map(mapLogFeedRow);
});

export const getTags = cache(async (): Promise<Tag[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tags").select("id, name, color").order("name");
  if (error || !data) return [];
  return data.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color ?? "#808080" }));
});
