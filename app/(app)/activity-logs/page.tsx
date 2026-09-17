import ActivityLogsTable from "@/components/ActivityLogsTable";
import DashboardHeader from "@/components/DashboardHeader";
import { getActivityLogsPage, getFieldNames, type ActivityLogsSortDir, type ActivityLogsSortField } from "@/lib/data-pages";
import type { ActivityType } from "@/lib/types";

const SORT_FIELDS = new Set<ActivityLogsSortField>(["date", "employee", "activity", "field"]);
const ACTIVITY_VALUES = new Set<ActivityType>([
  "spraying",
  "fertilizing",
  "planting",
  "irrigating",
  "harvesting",
  "scouting",
  "pruning",
  "soil_work",
  "equipment_maintenance",
]);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ActivityLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const q = first(params.q) || undefined;

  const activityParam = first(params.activity);
  const activity = activityParam
    ? activityParam.split(",").filter((value): value is ActivityType => ACTIVITY_VALUES.has(value as ActivityType))
    : [];

  const fieldParam = first(params.field);
  const field = fieldParam ? fieldParam.split(",").filter(Boolean) : [];

  const from = first(params.from) || undefined;
  const to = first(params.to) || undefined;

  const sortParam = first(params.sort);
  const sort: ActivityLogsSortField = sortParam && SORT_FIELDS.has(sortParam as ActivityLogsSortField)
    ? (sortParam as ActivityLogsSortField)
    : "date";

  const dirParam = first(params.dir);
  const dir: ActivityLogsSortDir =
    dirParam === "asc" || dirParam === "desc" ? dirParam : sort === "date" ? "desc" : "asc";

  const pageParam = Number(first(params.page));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const [{ rows, count, pageSize }, fieldOptions] = await Promise.all([
    getActivityLogsPage({ q, activity, field, from, to, sort, dir, page }),
    getFieldNames(),
  ]);

  return (
    <>
      <DashboardHeader title="Activity Logs" subtitle="Every voice log recorded on the farm" />
      <ActivityLogsTable
        rows={rows}
        count={count}
        page={page}
        pageSize={pageSize}
        filters={{ q, activity, field, from, to, sort, dir }}
        fieldOptions={fieldOptions}
      />
    </>
  );
}
