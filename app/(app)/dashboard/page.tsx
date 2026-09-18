import DashboardHeader from "@/components/DashboardHeader";
import LogsTable from "@/components/LogsTable";
import RealtimeRefresher from "@/components/RealtimeRefresher";
import StatCards from "@/components/StatCards";
import { getDashboardStats, getFields, getLogFeed, getTags, getViewer } from "@/lib/data";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Table state (search, sort, filters, expanded row) lives in the URL and is read
  // client-side by LogsTable via useSearchParams; awaiting here just keeps this route
  // correctly opted into dynamic rendering.
  await searchParams;

  const [viewer, stats, rows, tags, fields] = await Promise.all([
    getViewer(),
    getDashboardStats(),
    getLogFeed(),
    getTags(),
    getFields(),
  ]);

  return (
    <>
      <RealtimeRefresher />
      <DashboardHeader title="Dashboard" subtitle="An overview of your farm and employee activity" />
      <StatCards stats={stats} />
      <LogsTable rows={rows} tags={tags} fields={fields} referenceDate={new Date()} viewerRole={viewer.role} />
    </>
  );
}
