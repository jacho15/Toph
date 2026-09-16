import type { LucideIcon } from "lucide-react";

export default function StatCard({
  icon: Icon,
  label,
  value,
  trailingText,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  trailingText?: string;
}) {
  return (
    <div className="flex h-[115px] flex-1 flex-col justify-between rounded-[14px] border-[0.88px] border-border-subtle p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-ink" strokeWidth={1.33} />
        <span className="text-base leading-[20.8px] text-ink">{label}</span>
      </div>
      <div className="flex items-end gap-5">
        <span className="text-stat font-medium leading-[62.4px] text-ink">
          {value === null ? "—" : value}
        </span>
        {trailingText ? (
          <span className="pb-2 text-sm leading-[18.2px] text-text-muted">{trailingText}</span>
        ) : null}
      </div>
    </div>
  );
}
