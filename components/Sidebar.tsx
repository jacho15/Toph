import { Inbox, LogOut, UserStar } from "lucide-react";
import Image from "next/image";
import SidebarNav from "./SidebarNav";
import SwitchUserButton from "./SwitchUserButton";
import type { Viewer } from "@/lib/types";

const ROLE_LABEL: Record<Viewer["role"], string> = {
  admin: "Admin",
  manager: "Manager",
  worker: "Worker",
};

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Sidebar({
  viewer,
  newCount,
  logoutAction,
}: {
  viewer: Viewer;
  newCount: number;
  logoutAction?: () => Promise<void>;
}) {
  return (
    <div className="h-full w-[280px] shrink-0 self-stretch rounded-2xl bg-[linear-gradient(180deg,rgba(166,166,166,0.15),rgba(89,89,89,0.15))] p-px">
      <div className="flex h-full w-full min-h-0 flex-col gap-[10px] rounded-2xl bg-paper p-[10px]">
        <div className="flex h-[50px] items-center justify-between rounded py-1 pr-[14px] pl-1">
          <div className="flex items-center gap-2">
            <div className="relative h-[42px] w-[42px] shrink-0 overflow-hidden rounded-full shadow-[inset_0_3px_4.5px_rgba(0,0,0,0.10)]">
              {viewer.avatar_url ? (
                <Image src={viewer.avatar_url} alt="" fill sizes="42px" className="object-cover" />
              ) : viewer.role === "admin" ? (
                <Image src="/figma/avatar.png" alt="" fill sizes="42px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-border-subtle text-sm font-medium text-text-secondary">
                  {initials(viewer.full_name)}
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-sm font-medium leading-[18.2px] text-ink">{viewer.full_name}</span>
              <span className="flex items-center gap-[5px]">
                <UserStar className="h-[10px] w-[10px] text-text-muted" strokeWidth={1.33} />
                <span className="text-sm font-medium leading-[18.2px] text-text-muted">
                  {ROLE_LABEL[viewer.role]}
                </span>
              </span>
            </div>
          </div>
          <button type="button" aria-label="Inbox" className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40">
            <Inbox className="h-4 w-4 text-text-secondary" strokeWidth={1.33} />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <SidebarNav newCount={newCount} />
        </div>

        <div className="flex flex-col gap-1">
          <SwitchUserButton currentEmail={viewer.email} />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex h-[38px] w-full items-center gap-[14px] rounded px-[14px] py-[10px] text-left hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              <LogOut className="h-4 w-4 shrink-0 text-text-secondary" strokeWidth={1.33} />
              <span className="text-sm text-ink">Log Out</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
