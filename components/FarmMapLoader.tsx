"use client";

// `ssr: false` is only allowed in a Client Component (Next.js 16) — this thin wrapper exists so
// the actual page (app/(app)/map/page.tsx) can stay a Server Component.
import dynamic from "next/dynamic";
import type { FarmField, RecentLogLocation } from "@/lib/data-pages";

const FarmMap = dynamic(() => import("@/components/FarmMap"), {
  ssr: false,
  loading: () => <div className="min-h-[420px] flex-1 animate-pulse rounded-[14px] bg-border-subtle" />,
});

export default function FarmMapLoader({
  fields,
  locations,
}: {
  fields: FarmField[];
  locations: RecentLogLocation[];
}) {
  return <FarmMap fields={fields} locations={locations} />;
}
