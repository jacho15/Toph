import { AudioLines } from "lucide-react";
import { notFound } from "next/navigation";
import DashboardHeader from "@/components/DashboardHeader";

const SECTIONS: Record<string, { title: string; description: string }> = {
  "audit-manager": {
    title: "Audit Manager",
    description: "Review and sign off on compliance checks across the farm.",
  },
  reports: {
    title: "Reports",
    description: "Generate and export reports on farm activity.",
  },
  schedule: {
    title: "Schedule",
    description: "Plan and assign upcoming work across fields and crews.",
  },
  employees: {
    title: "Employees",
    description: "Manage worker profiles, roles, and access.",
  },
  performance: {
    title: "Performance",
    description: "Track productivity and activity trends by employee.",
  },
  messages: {
    title: "Messages",
    description: "Send and receive messages with your team.",
  },
  settings: {
    title: "Settings",
    description: "Configure farm details and account preferences.",
  },
  support: {
    title: "Support",
    description: "Get help or contact the Toph team.",
  },
};

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const entry = SECTIONS[section];
  if (!entry) notFound();

  return (
    <>
      <DashboardHeader title={entry.title} subtitle={entry.description} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[20px] border border-border-subtle bg-paper text-center">
        <AudioLines className="h-8 w-8 text-text-faint" strokeWidth={1.33} />
        <p className="text-base text-ink">Coming soon</p>
        <p className="max-w-sm text-sm text-text-secondary">{entry.description}</p>
        <p className="text-sm text-text-faint">Not part of this challenge scope.</p>
      </div>
    </>
  );
}
