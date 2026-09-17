import { ArrowDown, ArrowUp, AudioLines, Search, X } from "lucide-react";
import Link from "next/link";
import { formatActivityLabel, formatLogDate, formatTimeRange } from "@/lib/format";
import type { ActivityLogRow, ActivityLogsSortDir, ActivityLogsSortField } from "@/lib/data-pages";
import type { ActivityType } from "@/lib/types";

const ACTIVITY_OPTIONS: ActivityType[] = [
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

const COLUMNS: { key: ActivityLogsSortField | "time" | "duration" | "tags"; label: string; sortable: boolean }[] = [
  { key: "employee", label: "EMPLOYEE", sortable: true },
  { key: "activity", label: "ACTIVITY", sortable: true },
  { key: "date", label: "DATE", sortable: true },
  { key: "field", label: "FIELD", sortable: true },
  { key: "time", label: "TIME", sortable: false },
  { key: "duration", label: "DURATION", sortable: false },
  { key: "tags", label: "TAGS", sortable: false },
];

const GRID_COLS = "grid-cols-[1fr_1fr_1fr_1fr_1.1fr_100px_1.3fr]";

type Filters = {
  q?: string;
  activity: ActivityType[];
  field: string[];
  from?: string;
  to?: string;
  sort: ActivityLogsSortField;
  dir: ActivityLogsSortDir;
};

/**
 * Renders "13s", "45m", "4h", or "4h 40m"; there's no shared duration formatter in
 * lib/format.ts. Voice clips are usually seconds long, so anything under a minute is
 * shown in seconds rather than rounding to "0m".
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function serializeParams(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

function dateRangeLabel(from?: string, to?: string): string {
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  return `Until ${to}`;
}

export default function ActivityLogsTable({
  rows,
  count,
  page,
  pageSize,
  filters,
  fieldOptions,
}: {
  rows: ActivityLogRow[];
  count: number;
  page: number;
  pageSize: number;
  filters: Filters;
  fieldOptions: string[];
}) {
  function baseParams(): Record<string, string | undefined> {
    return {
      q: filters.q,
      activity: filters.activity.join(",") || undefined,
      field: filters.field.join(",") || undefined,
      from: filters.from,
      to: filters.to,
      sort: filters.sort,
      dir: filters.dir,
    };
  }

  function sortHref(field: ActivityLogsSortField): string {
    const nextDir: ActivityLogsSortDir =
      filters.sort === field ? (filters.dir === "asc" ? "desc" : "asc") : field === "date" ? "desc" : "asc";
    return serializeParams({ ...baseParams(), sort: field, dir: nextDir, page: "1" });
  }

  function pageHref(nextPage: number): string {
    return serializeParams({ ...baseParams(), page: String(nextPage) });
  }

  const chips: { key: string; label: string; href: string }[] = [];
  if (filters.q) {
    chips.push({
      key: "q",
      label: `Search: "${filters.q}"`,
      href: serializeParams({ ...baseParams(), q: undefined, page: "1" }),
    });
  }
  for (const activity of filters.activity) {
    chips.push({
      key: `activity-${activity}`,
      label: formatActivityLabel(activity),
      href: serializeParams({
        ...baseParams(),
        activity: filters.activity.filter((a) => a !== activity).join(",") || undefined,
        page: "1",
      }),
    });
  }
  for (const field of filters.field) {
    chips.push({
      key: `field-${field}`,
      label: field,
      href: serializeParams({
        ...baseParams(),
        field: filters.field.filter((f) => f !== field).join(",") || undefined,
        page: "1",
      }),
    });
  }
  if (filters.from || filters.to) {
    chips.push({
      key: "date",
      label: dateRangeLabel(filters.from, filters.to),
      href: serializeParams({ ...baseParams(), from: undefined, to: undefined, page: "1" }),
    });
  }

  const rangeStart = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, count);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < count;

  return (
    <div className="flex flex-1 flex-col rounded-[20px] border border-border-subtle bg-paper">
      <div className="flex min-h-[74px] flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-[30px] py-5">
        <div className="flex items-center gap-2">
          <AudioLines className="h-4 w-4 text-ink" strokeWidth={1.33} />
          <span className="text-base leading-[20.8px] text-ink">
            {count} {count === 1 ? "log" : "logs"}
          </span>
        </div>
        {chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={chip.href}
                className="flex h-[34px] items-center gap-[10px] rounded-[80px] bg-ink px-4 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
              >
                <X className="h-4 w-4" strokeWidth={1.33} />
                {chip.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 border-b border-border-subtle px-[30px] py-5"
      >
        <label className="flex h-[34px] w-[260px] items-center gap-[10px] rounded-[30px] border border-border-default bg-paper px-4 shadow-[0_0_4px_rgba(0,0,0,0.05)]">
          <Search className="h-4 w-4 shrink-0 text-text-placeholder" strokeWidth={1.33} />
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search employee, activity, field"
            className="w-full bg-transparent text-sm text-ink placeholder:text-text-placeholder focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-text-faint">ACTIVITY</span>
          <select
            name="activity"
            defaultValue={filters.activity[0] ?? ""}
            className="h-[34px] rounded border border-border-default bg-paper px-3 text-sm text-ink shadow-[0_0_4px_rgba(0,0,0,0.05)] focus:outline-none"
          >
            <option value="">All Activities</option>
            {ACTIVITY_OPTIONS.map((activity) => (
              <option key={activity} value={activity}>
                {formatActivityLabel(activity)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-text-faint">FIELD</span>
          <select
            name="field"
            defaultValue={filters.field[0] ?? ""}
            className="h-[34px] rounded border border-border-default bg-paper px-3 text-sm text-ink shadow-[0_0_4px_rgba(0,0,0,0.05)] focus:outline-none"
          >
            <option value="">All Fields</option>
            {fieldOptions.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-text-faint">FROM</span>
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className="h-[34px] rounded border border-border-default bg-paper px-3 text-sm text-ink shadow-[0_0_4px_rgba(0,0,0,0.05)] focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-text-faint">TO</span>
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className="h-[34px] rounded border border-border-default bg-paper px-3 text-sm text-ink shadow-[0_0_4px_rgba(0,0,0,0.05)] focus:outline-none"
          />
        </label>

        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <input type="hidden" name="page" value="1" />

        <button
          type="submit"
          className="flex h-[34px] items-center rounded-[80px] bg-ink px-4 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
        >
          Apply Filters
        </button>
        <Link href="/activity-logs" className="text-sm text-text-secondary underline-offset-2 hover:underline">
          Clear filters
        </Link>
      </form>

      <div className={`grid ${GRID_COLS} items-center border-b border-border-default px-[30px]`}>
        {COLUMNS.map((column) =>
          column.sortable ? (
            <Link
              key={column.key}
              href={sortHref(column.key as ActivityLogsSortField)}
              className="flex items-center gap-1 rounded px-[10px] py-5 text-sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              {column.label}
              {filters.sort === column.key ? (
                filters.dir === "asc" ? (
                  <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
                ) : (
                  <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
                )
              ) : null}
            </Link>
          ) : (
            <div key={column.key} className="px-[10px] py-5 text-sm text-text-secondary">
              {column.label}
            </div>
          )
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm text-text-secondary">No logs match your filters.</p>
          <Link href="/activity-logs" className="text-sm text-ink underline underline-offset-2">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/dashboard?open=${row.id}`}
              className={`grid h-[58px] ${GRID_COLS} items-center border-b border-border-subtle px-[30px] hover:bg-row-highlight focus-visible:bg-row-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/40`}
            >
              <div className="truncate px-[10px] text-sm text-text-secondary">{row.employee_name}</div>
              <div className="truncate px-[10px] text-sm text-text-secondary">
                {formatActivityLabel(row.activity)}
              </div>
              <div className="truncate px-[10px] text-sm text-text-secondary">{formatLogDate(row.started_at)}</div>
              <div className="truncate px-[10px] text-sm text-text-secondary">{row.field_name ?? "—"}</div>
              <div className="truncate px-[10px] text-sm text-text-secondary">
                {formatTimeRange(row.started_at, row.ended_at)}
              </div>
              <div className="truncate px-[10px] text-sm text-text-secondary">{formatDuration(row.duration_s)}</div>
              <div className="flex flex-wrap gap-1 px-[10px] py-2">
                {row.tags.length === 0 ? (
                  <span className="text-sm text-text-faint">{"—"}</span>
                ) : (
                  row.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full px-2 py-0.5 text-2xs font-medium text-paper"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {count > 0 ? (
        <div className="flex items-center justify-between border-t border-border-subtle px-[30px] py-4 text-sm text-text-secondary">
          <span>
            Showing {rangeStart}
            {"–"}
            {rangeEnd} of {count}
          </span>
          <div className="flex items-center gap-2">
            {hasPrev ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-[80px] border border-border-default bg-paper px-4 py-1.5 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-[80px] border border-border-subtle px-4 py-1.5 text-sm text-text-faint">
                Previous
              </span>
            )}
            {hasNext ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-[80px] border border-border-default bg-paper px-4 py-1.5 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-[80px] border border-border-subtle px-4 py-1.5 text-sm text-text-faint">
                Next
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
