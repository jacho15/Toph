"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function DashboardHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("q", next);
      else params.delete("q");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 250);
  }

  return (
    <div className="flex h-[87px] shrink-0 items-center justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold leading-[26px] text-ink">{title}</h1>
        <p className="text-base leading-[20.8px] text-text-secondary">{subtitle}</p>
      </div>
      <label className="flex h-[34px] w-[370px] items-center gap-[10px] rounded-[30px] border border-border-default bg-paper px-4 py-2 shadow-[0_0_4px_rgba(0,0,0,0.05)]">
        <Search className="h-4 w-4 shrink-0 text-text-placeholder" strokeWidth={1.33} />
        <span className="sr-only">Search</span>
        <input
          type="text"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Search"
          className="w-full bg-transparent text-sm text-ink placeholder:text-text-placeholder focus:outline-none"
        />
      </label>
    </div>
  );
}
