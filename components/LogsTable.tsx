"use client";

import { AudioLines, Check, Funnel, ListFilter, Square, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import ExpandedLog from "./ExpandedLog";
import { markLogsRead } from "@/app/actions/logs";
import { filterLogs, type LogsSortDir, type LogsSortField } from "@/lib/filter-logs";
import { formatActivityLabel, formatLogDate, formatTimeRange } from "@/lib/format";
import type { ActivityType, LogFeedRow, Tag, Viewer } from "@/lib/types";

const SORT_FIELDS: { value: LogsSortField; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "activity", label: "Activity" },
  { value: "field", label: "Field" },
  { value: "date", label: "Date" },
];

function parseTableState(searchParams: URLSearchParams) {
  const q = searchParams.get("q") ?? "";
  const sort = (searchParams.get("sort") as LogsSortField | null) ?? "date";
  const dir = (searchParams.get("dir") as LogsSortDir | null) ?? "desc";
  const month = searchParams.get("month") !== "0";
  const activityParam = searchParams.get("activity");
  const activity = activityParam ? (activityParam.split(",").filter(Boolean) as ActivityType[]) : [];
  const fieldParam = searchParams.get("field");
  const field = fieldParam ? fieldParam.split(",").filter(Boolean) : [];
  const open = searchParams.get("open");
  return { q, sort, dir, month, activity, field, open };
}

export default function LogsTable({
  rows,
  tags,
  referenceDate,
  viewerRole,
}: {
  rows: LogFeedRow[];
  tags: Tag[];
  referenceDate: Date;
  viewerRole: Viewer["role"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseTableState(searchParams), [searchParams]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const sortPopoverRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      filterLogs(rows, {
        q: state.q,
        sort: state.sort,
        dir: state.dir,
        month: state.month,
        activity: state.activity,
        field: state.field,
        referenceDate,
      }),
    [rows, state, referenceDate]
  );

  const allActivities = useMemo(
    () => Array.from(new Set(rows.map((row) => row.activity))).sort(),
    [rows]
  );
  const allFields = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.field_name).filter((name): name is string => Boolean(name)))).sort(),
    [rows]
  );

  useEffect(() => {
    if (!sortOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!sortPopoverRef.current?.contains(event.target as Node)) setSortOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSortOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!filterPopoverRef.current?.contains(event.target as Node)) setFilterOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filterOpen]);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function toggleDateChip() {
    if (state.sort !== "date") {
      updateParams({ sort: null, dir: null });
      return;
    }
    updateParams({ dir: state.dir === "desc" ? "asc" : null });
  }

  function resetDateSort() {
    updateParams({ sort: null, dir: null });
  }

  function toggleMonth() {
    updateParams({ month: state.month ? "0" : null });
  }

  function chooseSort(field: LogsSortField) {
    updateParams({ sort: field === "date" ? null : field, dir: null });
    setSortOpen(false);
  }

  function toggleActivityFilter(activity: ActivityType) {
    const next = state.activity.includes(activity)
      ? state.activity.filter((a) => a !== activity)
      : [...state.activity, activity];
    updateParams({ activity: next.length > 0 ? next.join(",") : null });
  }

  function toggleFieldFilter(field: string) {
    const next = state.field.includes(field) ? state.field.filter((f) => f !== field) : [...state.field, field];
    updateParams({ field: next.length > 0 ? next.join(",") : null });
  }

  async function markAsRead(ids: string[]) {
    if (ids.length === 0) return;
    setLocallyRead((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    await markLogsRead(ids);
    router.refresh();
  }

  function setOpen(id: string | null) {
    updateParams({ open: id });
  }

  function handleView(row: LogFeedRow) {
    const isOpen = state.open === row.id;
    setOpen(isOpen ? null : row.id);
    if (!isOpen && row.is_new && !locallyRead.has(row.id)) {
      void markAsRead([row.id]);
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((row) => row.id))));
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="flex flex-1 flex-col rounded-[20px] border border-border-subtle bg-paper">
      <div className="flex h-[74px] shrink-0 items-center justify-between border-b border-border-subtle px-[30px] py-5">
        <div className="flex items-center gap-2">
          <AudioLines className="h-4 w-4 text-ink" strokeWidth={1.33} />
          <span className="text-base leading-[20.8px] text-ink">
            New Employee Logs <span className="text-text-faint">({filtered.length})</span>
          </span>
        </div>

        {selected.size > 0 ? (
          <div className="flex items-center gap-3 rounded-full border border-border-default bg-paper px-4 py-2 shadow-[0_0_4px_rgba(0,0,0,0.05)]">
            <span className="text-sm text-text-secondary">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => {
                void markAsRead(Array.from(selected));
                setSelected(new Set());
              }}
              className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              Mark as read
            </button>
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => setSelected(new Set())}
              className="text-text-secondary focus-visible:outline-none"
            >
              <X className="h-4 w-4" strokeWidth={1.33} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-[10px]">
            <div className="flex h-[34px] items-center gap-1.5 rounded-[80px] bg-ink px-2 shadow-[0_0_4px_rgba(0,0,0,0.05)]">
              <button
                type="button"
                onClick={resetDateSort}
                aria-label="Reset date sort"
                className="flex items-center focus-visible:outline-none"
              >
                <X className="h-4 w-4 text-paper" strokeWidth={1.33} />
              </button>
              <button
                type="button"
                onClick={toggleDateChip}
                className="pr-[10px] text-sm text-paper focus-visible:outline-none"
              >
                Date
              </button>
            </div>

            <div ref={sortPopoverRef} className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((open) => !open)}
                aria-expanded={sortOpen}
                className="flex h-[34px] items-center gap-[10px] rounded-[80px] border border-border-default bg-paper px-4 shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                <ListFilter className="h-4 w-4 text-text-secondary" strokeWidth={1.33} />
                <span className="text-sm text-text-secondary">Sort</span>
              </button>
              {sortOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-10 w-[160px] rounded-lg border border-border-subtle bg-paper p-1.5 shadow-lg">
                  {SORT_FIELDS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => chooseSort(option.value)}
                      className={clsx(
                        "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-border-subtle focus-visible:outline-none",
                        state.sort === option.value ? "text-ink font-medium" : "text-text-secondary"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {state.month ? (
              <button
                type="button"
                onClick={toggleMonth}
                className="flex h-[34px] items-center gap-[10px] rounded-[80px] bg-ink px-4 text-sm text-paper shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
              >
                <X className="h-4 w-4" strokeWidth={1.33} />
                This Month ({filtered.length})
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleMonth}
                className="flex h-[34px] items-center rounded-[80px] border border-border-default bg-paper px-4 text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                This Month
              </button>
            )}

            <div ref={filterPopoverRef} className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen((open) => !open)}
                aria-expanded={filterOpen}
                className="flex h-[34px] items-center gap-[10px] rounded-[80px] border border-border-default bg-paper px-4 shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                <Funnel className="h-4 w-4 text-text-secondary" strokeWidth={1.33} />
                <span className="text-sm text-text-secondary">Filter</span>
              </button>
              {filterOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-10 w-[220px] rounded-lg border border-border-subtle bg-paper p-3 shadow-lg">
                  <p className="mb-1 text-2xs font-medium text-text-faint">ACTIVITY</p>
                  <ul className="mb-3 flex flex-col gap-1">
                    {allActivities.map((activity) => (
                      <li key={activity}>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={state.activity.includes(activity)}
                            onChange={() => toggleActivityFilter(activity)}
                          />
                          {formatActivityLabel(activity)}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="mb-1 text-2xs font-medium text-text-faint">FIELD</p>
                  <ul className="flex flex-col gap-1">
                    {allFields.map((field) => (
                      <li key={field}>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={state.field.includes(field)}
                            onChange={() => toggleFieldFilter(field)}
                          />
                          {field}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[56px_1fr_1fr_1fr_1fr_1fr_92px] items-center border-b border-border-default px-5">
        <div className="flex justify-center py-5">
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected}
            aria-label="Select all rows"
            onClick={toggleSelectAll}
            className="focus-visible:outline-none"
          >
            {allSelected ? (
              <span className="flex h-4 w-4 items-center justify-center rounded bg-ink">
                <Check className="h-3 w-3 text-paper" strokeWidth={2} />
              </span>
            ) : (
              <Square className="h-4 w-4 text-text-secondary" strokeWidth={1.33} />
            )}
          </button>
        </div>
        {["EMPLOYEE", "ACTIVITY", "DATE", "FIELD", "TIME"].map((label) => (
          <div key={label} className="px-[10px] py-5 text-sm text-text-secondary">
            {label}
          </div>
        ))}
        <div className="py-5" />
      </div>

      <div>
        {filtered.length === 0 ? (
          <div className="flex h-[58px] items-center justify-center text-sm text-text-secondary">
            No logs match your filters.
          </div>
        ) : (
          filtered.map((row) => {
            const isOpen = state.open === row.id;
            const isSelected = selected.has(row.id);
            return (
              <div key={row.id}>
                <div
                  className={clsx(
                    "grid h-[58px] grid-cols-[56px_1fr_1fr_1fr_1fr_1fr_92px] items-center border-b border-border-subtle px-5",
                    isOpen && "bg-row-highlight"
                  )}
                >
                  <div className="flex justify-center">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Select ${row.employee_name}`}
                      onClick={() => toggleRow(row.id)}
                      className="focus-visible:outline-none"
                    >
                      {isSelected ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded bg-ink">
                          <Check className="h-3 w-3 text-paper" strokeWidth={2} />
                        </span>
                      ) : (
                        <Square className="h-4 w-4 text-text-secondary" strokeWidth={1.33} />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 px-[10px] text-sm text-text-secondary">
                    {row.is_new && !locallyRead.has(row.id) ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-badge-green-fill" aria-hidden />
                    ) : null}
                    {row.employee_name}
                  </div>
                  <div className="px-[10px] text-sm text-text-secondary">{formatActivityLabel(row.activity)}</div>
                  <div className="px-[10px] text-sm text-text-secondary">{formatLogDate(row.started_at)}</div>
                  <div className="px-[10px] text-sm text-text-secondary">{row.field_name ?? "—"}</div>
                  <div className="px-[10px] text-sm text-text-secondary">
                    {formatTimeRange(row.started_at, row.ended_at)}
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => handleView(row)}
                      className={clsx(
                        "flex h-[34px] items-center justify-center rounded-[80px] border bg-paper text-sm text-text-secondary shadow-[0_0_4px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
                        isOpen ? "w-[69px] border-border-subtle" : "w-16 border-border-default"
                      )}
                    >
                      {isOpen ? "Close" : "View"}
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <div className="border-b border-border-subtle bg-paper">
                    <ExpandedLog log={row} availableTags={tags} viewerRole={viewerRole} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
