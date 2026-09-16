import { Calendar, ClipboardPen, Percent } from "lucide-react";
import StatCard from "./StatCard";
import type { DashboardStats } from "@/lib/types";

export default function StatCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex h-[115px] shrink-0 gap-[10px]">
      <StatCard
        icon={Calendar}
        label="Todays Recordings"
        value={stats.todays_recordings}
        trailingText={stats.todays_new > 0 ? `${stats.todays_new} New` : undefined}
      />
      <StatCard icon={ClipboardPen} label="Active Workers" value={stats.active_workers} />
      <StatCard icon={Percent} label="Response Accuracy" value={stats.response_accuracy} />
    </div>
  );
}
