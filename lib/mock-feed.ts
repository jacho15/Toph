import type { DashboardStats, LogFeedRow, Tag, Viewer } from "./types";

export const MOCK_VIEWER: Viewer = {
  id: "viewer-bays-ranch-admin",
  full_name: "Bays Ranch",
  role: "admin",
  avatar_url: "/figma/avatar.png",
};

/**
 * "Today" for this mock dataset. All rows sit in April 2026 (per the Figma spec's table
 * data), which is nowhere near the sandbox's real wall-clock date — so the "This Month"
 * filter is defined relative to this fixed reference instead of `Date.now()`. That keeps
 * server/client rendering deterministic (no hydration mismatch) and, at noon on the 22nd,
 * reproduces exactly the 4 rows (Isaac/Maya/Liam/Sophia) shown filtered in
 * public/figma/ref-default.png.
 */
export const MOCK_REFERENCE_DATE = new Date("2026-04-22T17:00:00.000Z"); // noon America/Chicago (CDT, UTC-5)

export const MOCK_STATS: DashboardStats = {
  todays_recordings: 5,
  todays_new: 1,
  active_workers: 12,
  response_accuracy: 90,
  new_logs_total: 4,
};

export const MOCK_TAGS: Tag[] = [
  { id: "tag-priority", name: "Priority", color: "#146c44" },
  { id: "tag-follow-up", name: "Follow Up", color: "#0065f0" },
  { id: "tag-review", name: "Review", color: "#b3b3b3" },
];

// Deterministic PRNG (mulberry32) so peaks are stable across server/client renders and builds.
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePeaks(seed: number, count = 100): number[] {
  const random = mulberry32(seed);
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    peaks.push(Math.round((0.12 + random() * 0.88) * 1000) / 1000);
  }
  return peaks;
}

// Small rectangle field boundary near lat 44.02, lng -93.30, nudged a little per row.
function makeBoundary(index: number): GeoJSON.Polygon {
  const lng = -93.3 + index * 0.004;
  const lat = 44.02 + index * 0.002;
  const dLng = 0.0035;
  const dLat = 0.0022;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

function makeLocation(boundary: GeoJSON.Polygon): GeoJSON.Point {
  const ring = boundary.coordinates[0];
  const lng = (ring[1][0] + ring[2][0]) / 2 + 0.0006;
  const lat = (ring[0][1] + ring[1][1]) / 2 - 0.0004;
  return { type: "Point", coordinates: [lng, lat] };
}

const SUMMARY_ROW_1 =
  "Offline guided voice log created at 2026-04-08T22:01:01.711Z. Question (activity_type): What type of activity was this — spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, or equipment maintenance? Answer: I'm leaving first, I'm going to go home. Question (field_block): Where were you working (field, block, or area)? Answer: yes, in one part and then 130 and 200 yes, and 130 for uh 160 and no, this yes no, no, uhm no no I remember, uhm uhm uhm, no, I don't remember anything.";

type RowSeed = {
  employee_name: string;
  activity: LogFeedRow["activity"];
  date: string; // YYYY-MM-DD, America/Chicago
  start: string; // HH:mm
  end: string; // HH:mm
  field_name: string;
  crop: string;
};

// Table data from design/figma-spec.md §5. The spec's literal activity labels (Weeding,
// Monitoring, Soil Testing, Seeding, Pest Control, Irrigation) don't all exist in the fixed
// `ActivityType` union from the data contract, so each is mapped to its closest enum value
// and rendered via formatActivityLabel — see the final report for the full mapping.
const ROW_SEEDS: RowSeed[] = [
  { employee_name: "Isaac Wang", activity: "spraying", date: "2026-04-19", start: "06:00", end: "10:40", field_name: "FIELD A", crop: "Corn" },
  { employee_name: "Maya Patel", activity: "harvesting", date: "2026-04-20", start: "07:30", end: "11:15", field_name: "FIELD B", crop: "Soybeans" },
  { employee_name: "Liam Johnson", activity: "planting", date: "2026-04-21", start: "08:00", end: "12:00", field_name: "FIELD C", crop: "Corn" },
  { employee_name: "Sophia Lee", activity: "irrigating", date: "2026-04-22", start: "06:30", end: "09:30", field_name: "FIELD D", crop: "Wheat" },
  { employee_name: "Ethan Kim", activity: "fertilizing", date: "2026-04-23", start: "05:45", end: "09:00", field_name: "FIELD E", crop: "Soybeans" },
  { employee_name: "Olivia Martinez", activity: "scouting", date: "2026-04-24", start: "06:15", end: "10:00", field_name: "FIELD F", crop: "Corn" },
  { employee_name: "Noah Brown", activity: "pruning", date: "2026-04-25", start: "07:00", end: "11:30", field_name: "FIELD G", crop: "Orchard" },
  { employee_name: "Emma Davis", activity: "scouting", date: "2026-04-26", start: "08:15", end: "12:45", field_name: "FIELD H", crop: "Soybeans" },
  { employee_name: "James Wilson", activity: "soil_work", date: "2026-04-27", start: "06:00", end: "09:00", field_name: "FIELD I", crop: "Corn" },
  { employee_name: "Isabella Garcia", activity: "planting", date: "2026-04-28", start: "07:45", end: "11:00", field_name: "FIELD J", crop: "Wheat" },
  { employee_name: "Benjamin Moore", activity: "spraying", date: "2026-04-29", start: "06:30", end: "10:30", field_name: "FIELD K", crop: "Soybeans" },
];

function chicagoIso(date: string, time: string): string {
  // April is CDT (America/Chicago, UTC-5).
  return `${date}T${time}:00-05:00`;
}

export const MOCK_LOG_ROWS: LogFeedRow[] = ROW_SEEDS.map((seed, index) => {
  const boundary = makeBoundary(index);
  const isFirst = index === 0;
  return {
    id: `log-${index + 1}`,
    farm_id: "farm-bays-ranch",
    employee_id: `employee-${index + 1}`,
    employee_name: seed.employee_name,
    employee_avatar_url: null,
    field_id: `field-${index + 1}`,
    field_name: seed.field_name,
    crop: seed.crop,
    activity: seed.activity,
    started_at: chicagoIso(seed.date, seed.start),
    ended_at: chicagoIso(seed.date, seed.end),
    audio_path: null,
    audio_mime: null,
    duration_s: 62 + index * 11,
    waveform_peaks: generatePeaks(index + 1),
    transcript: isFirst ? SUMMARY_ROW_1 : `Voice log recorded for ${seed.field_name}.`,
    summary: isFirst
      ? SUMMARY_ROW_1
      : `${seed.employee_name} logged ${seed.activity.replace("_", " ")} activity in ${seed.field_name}.`,
    details: {},
    field_boundary: boundary,
    location_geojson: makeLocation(boundary),
    tags: [],
    answers: [],
    is_new: isFirst,
    created_at: chicagoIso(seed.date, seed.end),
    spoken_name: null,
    attributed_profile_id: null,
    attributed_crew_member_id: null,
    attributed_name: null,
    display_name: seed.employee_name,
    uploaded_by: `employee-${index + 1}`,
    uploaded_by_name: seed.employee_name,
  };
});
