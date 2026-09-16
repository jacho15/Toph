import { AudioLines } from "lucide-react";
import { notFound } from "next/navigation";
import DashboardHeader from "@/components/DashboardHeader";

const SECTION_TITLES: Record<string, string> = {
  "activity-logs": "Activity Logs",
  map: "Map",
  "audit-manager": "Audit Manager",
  reports: "Reports",
  schedule: "Schedule",
  employees: "Employees",
  performance: "Performance",
  messages: "Messages",
  settings: "Settings",
  support: "Support",
};

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const title = SECTION_TITLES[section];
  if (!title) notFound();

  return (
    <>
      <DashboardHeader title={title} subtitle={`${title} will be available soon.`} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[20px] border border-border-subtle bg-paper text-center">
        <AudioLines className="h-8 w-8 text-text-faint" strokeWidth={1.33} />
        <p className="text-base text-ink">Coming soon</p>
        <p className="max-w-sm text-sm text-text-secondary">
          {title} is on the way. Check back shortly for updates.
        </p>
      </div>
    </>
  );
}
