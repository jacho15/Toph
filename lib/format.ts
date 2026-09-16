import type { ActivityType } from "./types";

const FARM_TIME_ZONE = "America/Chicago";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  spraying: "Spraying",
  fertilizing: "Fertilizing",
  planting: "Planting",
  irrigating: "Irrigating",
  harvesting: "Harvesting",
  scouting: "Scouting",
  pruning: "Pruning",
  soil_work: "Soil Work",
  equipment_maintenance: "Equipment Maintenance",
};

/** "Spraying", "Soil Work", ... */
export function formatActivityLabel(activity: ActivityType): string {
  return ACTIVITY_LABELS[activity];
}

/** "April 19, 2026" in the farm timezone. */
export function formatLogDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FARM_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: FARM_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "6:00 AM - 10:40 AM" in the farm timezone. Falls back to a single time if there's no end. */
export function formatTimeRange(startedAt: string, endedAt: string | null): string {
  const start = timeFormatter.format(new Date(startedAt));
  if (!endedAt) return start;
  const end = timeFormatter.format(new Date(endedAt));
  return `${start} - ${end}`;
}
