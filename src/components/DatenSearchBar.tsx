"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function DatenSearchBar({
  defaultValue,
  defaultSize,
  sizes,
  total,
}: {
  defaultValue: string;
  defaultSize: number;
  sizes: readonly number[];
  total: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [value, setValue] = useState(defaultValue);

  // Sync state, falls die URL extern geändert wurde (z. B. via Pagination).
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  function setParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.replace(`?${params.toString()}`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setParam({ q: value.trim() || null, page: null });
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-[color:var(--border)] rounded-lg p-3 flex flex-wrap items-center gap-3"
    >
      <div className="flex-1 min-w-[220px] relative">
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Suchen: Vor-/Nachname, Mitarbeiter, E-Mail, HubSpot-ID …"
          className="block w-full border border-[color:var(--border)] rounded-md pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[color:var(--brand-blue)]"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <button
        type="submit"
        className="text-sm px-3 py-2 rounded bg-[color:var(--brand-blue)] text-white font-medium hover:opacity-90"
      >
        Suchen
      </button>
      {defaultValue ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            setParam({ q: null, page: null });
          }}
          className="text-sm px-3 py-2 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
        >
          Zurücksetzen
        </button>
      ) : null}
      <div className="flex items-center gap-2 text-sm">
        <label className="text-[color:var(--muted)]">pro Seite:</label>
        <select
          value={defaultSize}
          onChange={(e) => setParam({ size: e.target.value, page: null })}
          className="border border-[color:var(--border)] rounded px-2 py-1 text-sm bg-white"
        >
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="text-xs text-[color:var(--muted)] ml-auto tabular-nums">
        {total} {total === 1 ? "Eintrag" : "Einträge"}
        {defaultValue ? " (gefiltert)" : ""}
      </div>
    </form>
  );
}
