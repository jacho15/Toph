export type ActivityType = 'spraying'|'fertilizing'|'planting'|'irrigating'|'harvesting'|'scouting'|'pruning'|'soil_work'|'equipment_maintenance';
export type Tag = { id: string; name: string; color: string };
export type LogAnswer = { question_key: string; question: string; answer: string; is_valid: boolean; position: number };
export type LogFeedRow = {
  id: string; farm_id: string; employee_id: string; employee_name: string; employee_avatar_url: string | null;
  field_id: string | null; field_name: string | null; crop: string | null;
  activity: ActivityType; started_at: string; ended_at: string | null;
  audio_path: string | null; audio_mime: string | null; duration_s: number | null; waveform_peaks: number[] | null;
  transcript: string | null; summary: string | null; details: Record<string, unknown>;
  field_boundary: GeoJSON.Polygon | null; location_geojson: GeoJSON.Point | null;
  tags: Tag[]; answers: LogAnswer[]; is_new: boolean; created_at: string;
  spoken_name: string | null; attributed_profile_id: string | null; attributed_crew_member_id: string | null;
  attributed_name: string | null; display_name: string;
  uploaded_by: string | null; uploaded_by_name: string | null;
  corrected_at: string | null; corrected_by_name: string | null;
};
export type Field = { id: string; name: string };
export type DashboardStats = { todays_recordings: number; todays_new: number; active_workers: number; response_accuracy: number | null; new_logs_total: number };
export type Viewer = { id: string; full_name: string; role: 'admin'|'manager'|'worker'; avatar_url: string | null; email?: string };
