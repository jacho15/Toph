"use client";

import {
  AudioLines,
  BookCheck,
  Calendar,
  ChartLine,
  ChartPie,
  Cog,
  Files,
  Handshake,
  Mail,
  Map,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    label: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: ChartLine },
      { label: "Activity Logs", href: "/activity-logs", icon: AudioLines },
      { label: "Map", href: "/map", icon: Map },
    ],
  },
  {
    label: "COMPLIANCE",
    items: [
      { label: "Audit Manager", href: "/audit-manager", icon: BookCheck },
      { label: "Reports", href: "/reports", icon: Files },
      { label: "Schedule", href: "/schedule", icon: Calendar },
    ],
  },
  {
    label: "TEAM MANAGEMENT",
    items: [
      { label: "Employees", href: "/employees", icon: Users },
      { label: "Performance", href: "/performance", icon: ChartPie },
      { label: "Messages", href: "/messages", icon: Mail },
    ],
  },
  {
    label: "OTHER",
    items: [
      { label: "Settings", href: "/settings", icon: Cog },
      { label: "Support", href: "/support", icon: Handshake },
    ],
  },
];

export default function SidebarNav({ newCount }: { newCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-[10px]">
      {SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <div className="px-[10px] py-1">
            <span className="text-2xs font-medium text-text-faint">{section.label}</span>
          </div>
          <div className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex h-[38px] items-center justify-between gap-[14px] rounded px-[14px] py-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
                    active ? "bg-ink/5" : "hover:bg-ink/[0.03]"
                  )}
                >
                  <span className="flex items-center gap-[14px]">
                    <Icon className="h-4 w-4 shrink-0 text-text-secondary" strokeWidth={1.33} />
                    <span className="text-sm text-ink">{item.label}</span>
                  </span>
                  {item.href === "/dashboard" && newCount > 0 ? (
                    <span className="flex h-[14px] min-w-[20px] items-center justify-center rounded-[50px] border-[0.5px] border-badge-green-border/26 bg-badge-green-fill/50 px-1 text-2xs font-medium text-paper">
                      {newCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
