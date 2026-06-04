"use client";
/**
 * Terminänderungen-Tabelle: Liste aller erkannten Diffs zwischen
 * aufeinanderfolgenden Snapshot-Tagen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const API = "/cashflow/api/seminarmanagement/kalender";

type Change = {
  detected_on: string;
  event_id: number;
  event_name: string | null;
  qualification_name: string | null;
  change_type: "event" | "schedule";
  schedule_id?: number;
  schedule_title?: string | null;
  field: string;
  from_value: string | null;
  to_value: string | null;
  user: string;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function TerminaenderungenClient() {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso);
  const [query, setQuery] = useState("");
  const [changeKind, setChangeKind] = useState<"all" | "event" | "schedule">(
    "all",
  );
  const [rows, setRows] = useState<Change[]>([]);
  const [meta, setMeta] = useState<{
    total: number;
    snapshot_days_available: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "500");
      const res = await fetch(`${API}/terminaenderungen?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? `HTTP ${res.status}`);
        setRows([]);
        setMeta(null);
        return;
      }
      setRows(json.changes ?? []);
      setMeta({
        total: json.total ?? 0,
        snapshot_days_available: json.snapshot_days_available ?? 0,
      });
    } catch (e) {
      setError(String(e));
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      changeKind === "all"
        ? rows
        : rows.filter((r) => r.change_type === changeKind),
    [rows, changeKind],
  );

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Von</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2 py-1 rounded border border-[color:var(--border)] bg-white text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Bis</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2 py-1 rounded border border-[color:var(--border)] bg-white text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-xs text-[color:var(--muted)]">
              Filter (Seminar-Name)
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z. B. Paarberatung"
              className="px-2 py-1 rounded border border-[color:var(--border)] bg-white text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Art</span>
            <select
              value={changeKind}
              onChange={(e) =>
                setChangeKind(e.target.value as "all" | "event" | "schedule")
              }
              className="px-2 py-1 rounded border border-[color:var(--border)] bg-white text-sm"
            >
              <option value="all">Alle</option>
              <option value="event">Seminar (Datum/Name/Ort)</option>
              <option value="schedule">Schedule (Tag/Zeit/Trainer)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-[color:var(--foreground)] text-white text-sm disabled:opacity-50"
          >
            {loading ? "Lade…" : "Aktualisieren"}
          </button>
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {meta
            ? `${meta.total} Änderungen · ${meta.snapshot_days_available} Snapshot-Tage im Zeitraum`
            : ""}
          {meta && meta.snapshot_days_available < 2 && (
            <span className="ml-2 text-amber-700">
              Hinweis: Es braucht mindestens 2 Snapshot-Tage, damit Diffs
              berechnet werden können. Der nächste Snapshot läuft täglich um
              06:15.
            </span>
          )}
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">
                  Erkannt am
                </th>
                <th className="px-3 py-2 font-medium">Seminar</th>
                <th className="px-3 py-2 font-medium">Reihe</th>
                <th className="px-3 py-2 font-medium">Was</th>
                <th className="px-3 py-2 font-medium">Vorher</th>
                <th className="px-3 py-2 font-medium">Nachher</th>
                <th className="px-3 py-2 font-medium">Quelle</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-red-600"
                  >
                    {error}
                  </td>
                </tr>
              )}
              {!error && loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-[color:var(--muted)]"
                  >
                    Lade…
                  </td>
                </tr>
              )}
              {!error && !loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-[color:var(--muted)]"
                  >
                    Keine Änderungen im Zeitraum gefunden.
                  </td>
                </tr>
              )}
              {filtered.map((c, idx) => (
                <tr
                  key={`${c.event_id}-${c.detected_on}-${c.field}-${idx}`}
                  className="border-t border-[color:var(--border)] align-top"
                >
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                    {c.detected_on}
                  </td>
                  <td className="px-3 py-2">
                    {c.event_name ?? `Event ${c.event_id}`}
                    {c.schedule_title && (
                      <div className="text-xs text-[color:var(--muted)]">
                        {c.schedule_title}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                    {c.qualification_name ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "inline-block px-2 py-0.5 rounded text-xs " +
                        (c.change_type === "event"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-sky-100 text-sky-800")
                      }
                    >
                      {c.field}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                    {c.from_value ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs font-semibold">
                    {c.to_value ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {c.user.startsWith("Bot:") ? (
                      <span className="text-emerald-700">{c.user}</span>
                    ) : (
                      <span className="text-[color:var(--muted)]">
                        {c.user}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
