"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  years: number[];
  current: number;
}

export default function YearFilter({ years, current }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setYear(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("year", value);
    else params.delete("year");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="inline-flex items-center gap-2 bg-white border border-[color:var(--border)] rounded-lg px-3 py-1.5">
      <label className="text-xs text-[color:var(--muted)]">Jahr</label>
      <select
        value={String(current)}
        onChange={(e) => setYear(e.target.value)}
        className="text-sm bg-transparent border-0 focus:outline-none pr-2 tabular-nums"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
