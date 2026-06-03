"use client";

/**
 * Seminar-Anmeldungen eines Kontakts (Teilnehmer-Management).
 *
 * Holt /cashflow/api/contacts/<id>/events live aus SimplyOrg via
 * Bot-Proxy. Wird im Detail-Panel von ContactSearch unterhalb der
 * Anschrift gerendert.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import SeminarBookingModal from "./SeminarBookingModal";

interface Schedule {
  schedule_id: number;
  schedule_date: string;
  event_id: number;
  start_time?: string | null;
  end_time?: string | null;
  trainer_names?: string;
  location_name?: string;
  title?: string;
}

interface SeminarEvent {
  event_id: number;
  event_name: string;
  von: string;
  bis: string;
  status: string;
  rolle: string;
}

interface EventsResponse {
  ok?: boolean;
  count?: number;
  events?: SeminarEvent[];
  error?: string;
}

export default function ContactSeminars({
  personId,
  personName,
}: {
  personId: number;
  personName: string;
}) {
  const [events, setEvents] = useState<SeminarEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeTrainer, setIncludeTrainer] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [stornoEventId, setStornoEventId] = useState<number | null>(null);
  const [stornoReason, setStornoReason] = useState("");
  const [stornoSubmitting, setStornoSubmitting] = useState(false);
  const [stornoError, setStornoError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showStorniert, setShowStorniert] = useState(true);
  // Expand-State pro Zeile + lazy-geladene Schedules
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [schedulesByEvent, setSchedulesByEvent] = useState<
    Record<number, { loading: boolean; data: Schedule[] | null; error: string | null }>
  >({});

  const loadSchedules = useCallback(async (eventId: number) => {
    setSchedulesByEvent((prev) => ({
      ...prev,
      [eventId]: { loading: true, data: prev[eventId]?.data ?? null, error: null },
    }));
    try {
      const res = await fetch(
        `/cashflow/api/events/${eventId}/schedules`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        schedules?: Schedule[];
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSchedulesByEvent((prev) => ({
        ...prev,
        [eventId]: { loading: false, data: json.schedules ?? [], error: null },
      }));
    } catch (err) {
      setSchedulesByEvent((prev) => ({
        ...prev,
        [eventId]: {
          loading: false,
          data: null,
          error: (err as Error).message,
        },
      }));
    }
  }, []);

  const toggleExpand = useCallback(
    (eventId: number) => {
      setExpandedId((cur) => (cur === eventId ? null : eventId));
      // Lade Schedules wenn neu aufgeklappt + noch nicht geladen
      const existing = schedulesByEvent[eventId];
      if (expandedId !== eventId && (!existing || (!existing.data && !existing.loading))) {
        void loadSchedules(eventId);
      }
    },
    [expandedId, schedulesByEvent, loadSchedules],
  );

  const fetchEvents = useCallback(
    async (withTrainer: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (withTrainer) params.set("include_trainer", "1");
        const qs = params.toString();
        const url =
          `/cashflow/api/contacts/${personId}/events` +
          (qs ? `?${qs}` : "");
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as EventsResponse;
        if (!res.ok || json.ok === false) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setEvents(json.events ?? []);
      } catch (err) {
        setError((err as Error).message || "Seminare laden fehlgeschlagen");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [personId],
  );

  useEffect(() => {
    setEvents(null);
    void fetchEvents(includeTrainer);
  }, [personId, includeTrainer, fetchEvents]);

  // Lokale Filterung: Such-String (gegen Titel, ID, Rolle) +
  // optional Storniert ausblenden
  const filteredEvents = useMemo(() => {
    if (!events) return null;
    const f = filter.trim().toLowerCase();
    return events.filter((ev) => {
      const isStorniert = (ev.status || "").toLowerCase().includes("storn");
      if (!showStorniert && isStorniert) return false;
      if (!f) return true;
      return (
        (ev.event_name || "").toLowerCase().includes(f) ||
        String(ev.event_id).includes(f) ||
        (ev.status || "").toLowerCase().includes(f) ||
        (ev.rolle || "").toLowerCase().includes(f)
      );
    });
  }, [events, filter, showStorniert]);

  const submitStorno = useCallback(async () => {
    if (stornoEventId == null) return;
    if (stornoReason.trim().length < 5) {
      setStornoError("Bitte einen Grund (mind. 5 Zeichen) angeben.");
      return;
    }
    setStornoSubmitting(true);
    setStornoError(null);
    try {
      const res = await fetch(
        `/cashflow/api/contacts/${personId}/events/${stornoEventId}/storno`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: stornoReason.trim() }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setStornoEventId(null);
      setStornoReason("");
      void fetchEvents(includeTrainer);
    } catch (err) {
      setStornoError((err as Error).message);
    } finally {
      setStornoSubmitting(false);
    }
  }, [personId, stornoEventId, stornoReason, includeTrainer, fetchEvents]);

  return (
    <div className="border-t border-[color:var(--border)] pt-4 mt-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
            Seminar-Übersicht
            {events ? (
              <span className="ml-2 text-xs font-normal text-[color:var(--muted)]">
                {filteredEvents != null && filteredEvents.length !== events.length
                  ? `${filteredEvents.length} / ${events.length}`
                  : events.length}{" "}
                {(filteredEvents?.length ?? events.length) === 1
                  ? "Eintrag"
                  : "Einträge"}
              </span>
            ) : null}
          </h3>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            Live aus SimplyOrg
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTrainer}
              onChange={(e) => setIncludeTrainer(e.target.checked)}
              className="accent-[color:var(--brand-orange)]"
            />
            <span>Trainer-Rollen anzeigen</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showStorniert}
              onChange={(e) => setShowStorniert(e.target.checked)}
              className="accent-[color:var(--brand-orange)]"
            />
            <span>Stornierte anzeigen</span>
          </label>
          <button
            type="button"
            onClick={() => fetchEvents(includeTrainer)}
            disabled={loading}
            className={
              "px-2.5 py-1 rounded-md font-semibold transition-colors " +
              (loading
                ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-wait"
                : "border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30")
            }
          >
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
          <button
            type="button"
            onClick={() => setBookingOpen(true)}
            className="px-2.5 py-1 rounded-md font-semibold bg-[color:var(--brand-orange)] text-white hover:opacity-90"
          >
            + Einbuchen
          </button>
        </div>
      </div>

      {/* Lokale Suche */}
      {events && events.length > 3 ? (
        <div className="mb-3">
          <div className="relative">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtern: Titel, ID, Status, Rolle …"
              className="block w-full border border-[color:var(--border)] rounded-md pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[color:var(--brand-blue)]"
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 mb-2">
          {error}
        </div>
      ) : null}

      {loading && !events ? (
        <div className="text-xs text-[color:var(--muted)] py-4 text-center">
          Lade Seminare …
        </div>
      ) : filteredEvents && filteredEvents.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                <th className="w-6"></th>
                <th className="text-left py-1.5 pr-3 font-semibold">Von</th>
                <th className="text-left py-1.5 pr-3 font-semibold">Bis</th>
                <th className="text-right py-1.5 pr-3 font-semibold">ID</th>
                <th className="text-left py-1.5 pr-3 font-semibold">
                  Seminartitel
                </th>
                <th className="text-left py-1.5 pr-3 font-semibold">Status</th>
                <th className="text-left py-1.5 pr-3 font-semibold">Rolle</th>
                <th className="text-right py-1.5 font-semibold w-16">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev, i) => {
                const isStorniert = (ev.status || "")
                  .toLowerCase()
                  .includes("storn");
                const isExpanded = expandedId === ev.event_id;
                const sched = schedulesByEvent[ev.event_id];
                return (
                  <Fragment key={`${ev.event_id}-${i}`}>
                    <tr className="border-b border-[color:var(--border)]/60">
                      <td className="py-2 align-top">
                        <button
                          type="button"
                          onClick={() => toggleExpand(ev.event_id)}
                          className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-[color:var(--brand-yellow)]/30 text-[color:var(--muted)]"
                          aria-label={isExpanded ? "Termine ausblenden" : "Termine anzeigen"}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            className={
                              "transition-transform " +
                              (isExpanded ? "rotate-90" : "")
                            }
                          >
                            <path
                              d="M3 1 L7 5 L3 9 Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {ev.von || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {ev.bis || "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs text-[color:var(--muted)] tabular-nums">
                        {ev.event_id}
                      </td>
                      <td className="py-2 pr-3">{ev.event_name || "—"}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={ev.status} />
                      </td>
                      <td className="py-2 pr-3 text-xs text-[color:var(--muted)]">
                        {ev.rolle || "Teilnehmer"}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {isStorniert ? (
                          <span className="text-[10px] text-[color:var(--muted)]">
                            —
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setStornoEventId(ev.event_id);
                              setStornoReason("");
                              setStornoError(null);
                            }}
                            className="text-[11px] px-2 py-0.5 rounded border border-red-300 text-red-700 hover:bg-red-50 font-semibold"
                          >
                            Storno
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-[color:var(--brand-yellow)]/10">
                        <td></td>
                        <td colSpan={7} className="py-2 pr-3">
                          <SchedulesPanel
                            sched={sched}
                            eventId={ev.event_id}
                            onRetry={() => loadSchedules(ev.event_id)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : events && (events.length === 0 || (filteredEvents && filteredEvents.length === 0)) && !error ? (
        <div className="text-xs text-[color:var(--muted)] py-4 text-center">
          {events.length === 0
            ? "Keine Seminar-Anmeldungen gefunden."
            : "Keine Treffer im Filter."}
        </div>
      ) : null}

      {/* Booking-Modal */}
      <SeminarBookingModal
        personId={personId}
        personName={personName}
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onSuccess={() => fetchEvents(includeTrainer)}
      />

      {/* Storno-Confirm-Modal */}
      {stornoEventId != null ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !stornoSubmitting && setStornoEventId(null)}
        >
          <div
            className="bg-white rounded-lg max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">Anmeldung stornieren?</h3>
            <p className="text-sm text-[color:var(--muted)] mt-1">
              {personName} aus „
              {events?.find((e) => e.event_id === stornoEventId)?.event_name ??
                `Event ${stornoEventId}`}
              " (ID {stornoEventId}).
            </p>
            <label className="text-xs uppercase tracking-wide text-[color:var(--muted)] block mt-4 mb-1">
              Grund (Audit-Log)
            </label>
            <input
              type="text"
              value={stornoReason}
              onChange={(e) => setStornoReason(e.target.value)}
              placeholder="z. B. Krankheit / Nachfrage Kunde"
              className="block w-full border border-[color:var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
              autoFocus
            />
            {stornoError ? (
              <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {stornoError}
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStornoEventId(null)}
                disabled={stornoSubmitting}
                className="px-3 py-1.5 rounded border border-[color:var(--border)] text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={submitStorno}
                disabled={
                  stornoSubmitting || stornoReason.trim().length < 5
                }
                className={
                  "px-4 py-1.5 rounded text-sm font-semibold " +
                  (stornoSubmitting || stornoReason.trim().length < 5
                    ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
                    : "bg-red-600 text-white hover:opacity-90")
                }
              >
                {stornoSubmitting ? "Storniere …" : "Stornieren"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SchedulesPanel({
  sched,
  eventId,
  onRetry,
}: {
  sched:
    | { loading: boolean; data: Schedule[] | null; error: string | null }
    | undefined;
  eventId: number;
  onRetry: () => void;
}) {
  if (!sched || (sched.loading && !sched.data)) {
    return (
      <div className="text-xs text-[color:var(--muted)] py-2">
        Lade Einzeltermine …
      </div>
    );
  }
  if (sched.error) {
    return (
      <div className="text-xs py-2">
        <span className="text-red-700">Fehler: {sched.error}</span>{" "}
        <button
          type="button"
          onClick={onRetry}
          className="text-[color:var(--brand-blue)] underline"
        >
          erneut versuchen
        </button>
      </div>
    );
  }
  const data = sched.data ?? [];
  if (data.length === 0) {
    return (
      <div className="text-xs text-[color:var(--muted)] py-2">
        Keine Einzeltermine hinterlegt (Event {eventId}).
      </div>
    );
  }
  return (
    <div className="py-2">
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)] mb-1.5">
        Einzeltermine ({data.length})
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {data.map((s) => (
          <div
            key={s.schedule_id}
            className="rounded border border-[color:var(--border)]/60 bg-white px-2 py-1.5"
          >
            <div className="text-xs font-medium tabular-nums">
              {fmtScheduleDate(s.schedule_date)}
              {s.start_time ? (
                <span className="ml-1 text-[color:var(--muted)] font-normal">
                  · {s.start_time}
                  {s.end_time ? `–${s.end_time}` : ""}
                </span>
              ) : null}
            </div>
            {s.title ? (
              <div className="text-[11px] text-[color:var(--muted)] mt-0.5 truncate">
                {s.title}
              </div>
            ) : null}
            {s.trainer_names ? (
              <div className="text-[11px] text-[color:var(--muted)] mt-0.5 truncate">
                Trainer: {s.trainer_names}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtScheduleDate(s: string | undefined): string {
  if (!s) return "—";
  // YYYY-MM-DD oder YYYY-MM-DDTHH:mm:ss -> DD.MM.YYYY [HH:mm]
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return s;
  const base = `${m[3]}.${m[2]}.${m[1]}`;
  return m[4] ? `${base} ${m[4]}:${m[5]}` : base;
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").trim();
  if (!s) return <span className="text-[color:var(--muted)]">—</span>;
  const lc = s.toLowerCase();
  let cls = "bg-slate-100 text-slate-700";
  if (lc.includes("bestät") || lc.includes("bestaet")) {
    cls = "bg-green-100 text-green-800";
  } else if (lc.includes("teilgenommen") || lc.includes("bestanden")) {
    cls = "bg-emerald-100 text-emerald-800";
  } else if (lc.includes("storn")) {
    cls = "bg-red-100 text-red-700";
  } else if (lc.includes("warte") || lc.includes("ange")) {
    cls = "bg-amber-100 text-amber-800";
  } else if (lc.includes("umgebucht")) {
    cls = "bg-blue-100 text-blue-800";
  }
  return (
    <span
      className={
        "inline-block text-[11px] px-1.5 py-0.5 rounded font-semibold " + cls
      }
    >
      {s}
    </span>
  );
}
