"use client";
/**
 * Kalender-Historie: zeigt, wie der SimplyOrg-Kalender an einem
 * bestimmten Tag ausgesehen hat (oder wie sich ein Event ueber die
 * Zeit veraendert hat).
 *
 * Drei Modi:
 *   - "at-date": alle Events an einem Snapshot-Datum
 *   - "history": Timeline eines einzelnen Events
 *   - Manuell Snapshot triggern
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const API = "/cashflow/api/seminarmanagement/kalender";

type SnapshotDate = {
  snapshot_date: string;
  events_seen: number | null;
  schedules_seen: number | null;
  started_at: string;
  error: string | null;
};

type EventRow = {
  event_id: number;
  event_name: string | null;
  event_startdate: string | null;
  event_enddate: string | null;
  location: string | null;
  max_registration: number | null;
  aktive: number | null;
  qualification_id: number | null;
  qualification_name: string | null;
  event_status: string | null;
  is_completed: boolean | null;
};

type HistoryEntry = EventRow & {
  snapshot_date: string;
  __changed_fields?: string[];
};

type ScheduleChange = {
  snapshot_date: string;
  schedules: Array<{
    schedule_id: number;
    schedule_date: string | null;
    start_time: string | null;
    end_time: string | null;
    title: string | null;
    trainer_names: string | null;
  }>;
};

export default function KalenderHistorieClient() {
  const [dates, setDates] = useState<SnapshotDate[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  // At-Date
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [query, setQuery] = useState("");
  const [atDateRows, setAtDateRows] = useState<EventRow[]>([]);
  const [atDateLoading, setAtDateLoading] = useState(false);

  // History (drill-down)
  const [historyEventId, setHistoryEventId] = useState<number | null>(null);
  const [historyEventName, setHistoryEventName] = useState<string>("");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyScheduleChanges, setHistoryScheduleChanges] = useState<
    ScheduleChange[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Lade verfuegbare Snapshot-Tage
  const loadDates = useCallback(async () => {
    setDatesLoading(true);
    try {
      const res = await fetch(`${API}/snapshot`, { cache: "no-store" });
      const json = await res.json();
      setDates(json?.dates ?? []);
      if ((json?.dates ?? []).length > 0 && !selectedDate)
        setSelectedDate(json.dates[0].snapshot_date);
    } catch (e) {
      console.error(e);
    } finally {
      setDatesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadDates();
  }, [loadDates]);

  const triggerSnapshot = useCallback(async () => {
    setSnapshotting(true);
    setSnapshotMsg(null);
    try {
      const res = await fetch(`${API}/snapshot`, { method: "POST" });
      const json = await res.json();
      if (res.ok)
        setSnapshotMsg(
          `OK – ${json.events_upserted ?? "?"} Events / ` +
            `${json.schedules_upserted ?? "?"} Schedules ` +
            `gesichert (${json.duration_sec ?? "?"}s).`,
        );
      else setSnapshotMsg(`Fehler: ${json?.error ?? res.status}`);
      await loadDates();
    } catch (e) {
      setSnapshotMsg(`Fehler: ${String(e)}`);
    } finally {
      setSnapshotting(false);
    }
  }, [loadDates]);

  // Lade Events fuer das gewaehlte Datum
  const loadAtDate = useCallback(async () => {
    if (!selectedDate) return;
    setAtDateLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`${API}/at-date?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setAtDateRows(json?.events ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setAtDateLoading(false);
    }
  }, [selectedDate, query]);

  useEffect(() => {
    void loadAtDate();
  }, [loadAtDate]);

  // Drill-Down: Event-Timeline
  const openHistory = useCallback(async (eid: number, name: string) => {
    setHistoryEventId(eid);
    setHistoryEventName(name);
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/history?event_id=${eid}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setHistoryEntries(json?.changes ?? []);
      setHistoryScheduleChanges(json?.schedule_changes ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryEventId(null);
    setHistoryEventName("");
    setHistoryEntries([]);
    setHistoryScheduleChanges([]);
  }, []);

  const totalDays = dates.length;
  const lastDay = useMemo(() => dates[0]?.snapshot_date ?? "–", [dates]);

  return (
    <div className="space-y-6">
      {/* Status-Leiste + manueller Trigger */}
      <div className="rounded-md border border-[color:var(--card-border)] bg-[color:var(--card-bg)] p-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold text-[color:var(--foreground)]">
              Tägliche Kalender-Sicherung
            </div>
            <div className="text-xs text-[color:var(--muted)]">
              {datesLoading
                ? "Lade…"
                : `${totalDays} Snapshot-Tage gespeichert. Letzter Stand: ${lastDay}. Cron: täglich 06:15.`}
            </div>
          </div>
          <button
            type="button"
            onClick={triggerSnapshot}
            disabled={snapshotting}
            className="px-3 py-1.5 text-sm rounded bg-[color:var(--foreground)] text-[color:var(--background)] disabled:opacity-50"
          >
            {snapshotting ? "Snapshot läuft…" : "Snapshot jetzt"}
          </button>
        </div>
        {snapshotMsg && (
          <div className="text-xs text-[color:var(--muted)]">{snapshotMsg}</div>
        )}
      </div>

      {/* Datums-Picker + Suche */}
      <div className="rounded-md border border-[color:var(--card-border)] bg-[color:var(--card-bg)] p-4 space-y-3">
        <div className="text-sm font-semibold">
          Kalender-Zustand an einem bestimmten Tag
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">
              Snapshot-Datum
            </span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-1 rounded border border-[color:var(--card-border)] bg-[color:var(--background)] text-sm min-w-[180px]"
            >
              {dates.length === 0 && (
                <option value="">– kein Snapshot vorhanden –</option>
              )}
              {dates.map((d) => (
                <option key={d.snapshot_date} value={d.snapshot_date}>
                  {d.snapshot_date} ({d.events_seen ?? 0} Events)
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-xs text-[color:var(--muted)]">
              Filter (Event-/Reihen-Name)
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z. B. Paarberatung"
              className="px-2 py-1 rounded border border-[color:var(--card-border)] bg-[color:var(--background)] text-sm"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[color:var(--muted)]">
              <tr className="text-left">
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Reihe</th>
                <th className="py-2 pr-3 whitespace-nowrap">Von</th>
                <th className="py-2 pr-3 whitespace-nowrap">Bis</th>
                <th className="py-2 pr-3">TN</th>
                <th className="py-2 pr-3">Max</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {atDateLoading && (
                <tr>
                  <td colSpan={8} className="py-4 text-[color:var(--muted)]">
                    Lade…
                  </td>
                </tr>
              )}
              {!atDateLoading && atDateRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-[color:var(--muted)]">
                    Keine Events für dieses Datum.
                  </td>
                </tr>
              )}
              {atDateRows.map((r) => (
                <tr
                  key={r.event_id}
                  className="border-t border-[color:var(--card-border)]"
                >
                  <td className="py-1.5 pr-3">{r.event_name ?? "–"}</td>
                  <td className="py-1.5 pr-3 text-xs text-[color:var(--muted)]">
                    {r.qualification_name ?? "–"}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {r.event_startdate ?? "–"}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {r.event_enddate ?? "–"}
                  </td>
                  <td className="py-1.5 pr-3">{r.aktive ?? 0}</td>
                  <td className="py-1.5 pr-3">{r.max_registration ?? "–"}</td>
                  <td className="py-1.5 pr-3 text-xs">
                    {r.is_completed ? (
                      <span className="text-[color:var(--muted)]">
                        abgeschlossen
                      </span>
                    ) : (
                      <span>{r.event_status ?? "aktiv"}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    <button
                      type="button"
                      onClick={() =>
                        openHistory(r.event_id, r.event_name ?? `Event ${r.event_id}`)
                      }
                      className="text-xs underline text-[color:var(--accent)] hover:opacity-80"
                    >
                      Verlauf
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History-Drawer */}
      {historyEventId !== null && (
        <div className="rounded-md border border-[color:var(--card-border)] bg-[color:var(--card-bg)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">
                Verlauf: {historyEventName}{" "}
                <span className="text-xs text-[color:var(--muted)]">
                  (Event {historyEventId})
                </span>
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                Nur Tage mit erkannter Änderung gegenüber dem Vortag.
              </div>
            </div>
            <button
              type="button"
              onClick={closeHistory}
              className="text-xs underline text-[color:var(--muted)]"
            >
              schließen
            </button>
          </div>
          {historyLoading ? (
            <div className="text-sm text-[color:var(--muted)]">Lade…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[color:var(--muted)]">
                    <tr className="text-left">
                      <th className="py-2 pr-3">Snapshot</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3 whitespace-nowrap">Von</th>
                      <th className="py-2 pr-3 whitespace-nowrap">Bis</th>
                      <th className="py-2 pr-3">TN / Max</th>
                      <th className="py-2 pr-3">Geändert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEntries.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-3 text-[color:var(--muted)]">
                          Keine Snapshot-Historie für dieses Event.
                        </td>
                      </tr>
                    )}
                    {historyEntries.map((h) => (
                      <tr
                        key={h.snapshot_date}
                        className="border-t border-[color:var(--card-border)]"
                      >
                        <td className="py-1.5 pr-3 whitespace-nowrap font-mono text-xs">
                          {h.snapshot_date}
                        </td>
                        <td className="py-1.5 pr-3">{h.event_name ?? "–"}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {h.event_startdate ?? "–"}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {h.event_enddate ?? "–"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {h.aktive ?? 0} / {h.max_registration ?? "–"}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-amber-600">
                          {(h.__changed_fields ?? []).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {historyScheduleChanges.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[color:var(--muted)]">
                    Schedule-Änderungen (Tag-Termine)
                  </div>
                  {historyScheduleChanges.map((sc) => (
                    <details
                      key={sc.snapshot_date}
                      className="rounded border border-[color:var(--card-border)] p-2 text-xs"
                    >
                      <summary className="cursor-pointer">
                        {sc.snapshot_date} — {sc.schedules.length} Schedules
                      </summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[color:var(--muted)]">
                            <tr className="text-left">
                              <th className="pr-3">Tag</th>
                              <th className="pr-3">Datum</th>
                              <th className="pr-3">Zeit</th>
                              <th className="pr-3">Trainer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sc.schedules.map((s) => (
                              <tr key={s.schedule_id}>
                                <td className="pr-3">{s.title ?? "–"}</td>
                                <td className="pr-3 whitespace-nowrap">
                                  {s.schedule_date ?? "–"}
                                </td>
                                <td className="pr-3 whitespace-nowrap">
                                  {s.start_time ?? "–"} – {s.end_time ?? "–"}
                                </td>
                                <td className="pr-3">{s.trainer_names ?? "–"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
