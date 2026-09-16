"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Subscribes to realtime changes on logs/log_tags/log_reads and refreshes the route (debounced). */
export default function RealtimeRefresher() {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function scheduleRefresh() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        router.refresh();
      }, 300);
    }

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "logs" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "log_tags" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "log_reads" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
