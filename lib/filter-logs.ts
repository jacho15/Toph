import { formatActivityLabel } from "./format";
import type { ActivityType, LogFeedRow } from "./types";

export type LogsSortField = "employee" | "activity" | "field" | "date";
export type LogsSortDir = "asc" | "desc";

export type FilterLogsOptions = {
  /** Free-text search against employee, activity, field and crop. */
  q?: string;
  sort?: LogsSortField;
  dir?: LogsSortDir;
  /** Restrict to the reference month, up through referenceDate (inclusive). */
  month?: boolean;
  activity?: ActivityType[];
  /** field_name values */
  field?: string[];
  /** "Today" for the month filter — pass explicitly for deterministic, testable results. */
  referenceDate: Date;
};

/** Pure filter + sort over a set of log rows. Shared by the client table and (later) the server. */
export function filterLogs(rows: LogFeedRow[], options: FilterLogsOptions): LogFeedRow[] {
  const { q, sort = "date", dir = "desc", month = false, activity, field, referenceDate } = options;

  let result = rows;

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    result = result.filter((row) => {
      const haystack = [
        row.employee_name,
        row.attributed_name ?? "",
        formatActivityLabel(row.activity),
        row.field_name ?? "",
        row.crop ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  if (activity && activity.length > 0) {
    const set = new Set(activity);
    result = result.filter((row) => set.has(row.activity));
  }

  if (field && field.length > 0) {
    const set = new Set(field);
    result = result.filter((row) => row.field_name !== null && set.has(row.field_name));
  }

  if (month) {
    const refYear = referenceDate.getUTCFullYear();
    const refMonth = referenceDate.getUTCMonth();
    result = result.filter((row) => {
      const started = new Date(row.started_at);
      return (
        started.getUTCFullYear() === refYear &&
        started.getUTCMonth() === refMonth &&
        started.getTime() <= referenceDate.getTime()
      );
    });
  }

  const sorted = [...result].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "employee":
        cmp = a.employee_name.localeCompare(b.employee_name);
        break;
      case "activity":
        cmp = formatActivityLabel(a.activity).localeCompare(formatActivityLabel(b.activity));
        break;
      case "field":
        cmp = (a.field_name ?? "").localeCompare(b.field_name ?? "");
        break;
      case "date":
      default:
        cmp = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
        break;
    }
    return dir === "desc" ? -cmp : cmp;
  });

  return sorted;
}
