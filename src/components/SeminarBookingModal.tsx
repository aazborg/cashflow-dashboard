"use client";

/**
 * Modal zum Einbuchen einer Person in ein Seminar/Reihe.
 *
 * Phase 1: Such-Feld -> /api/seminars/search liefert Reihen + Events.
 * Phase 2: Auswahl + Belegungs-Status (live snapshot fuer ausgewaehltes
 *          Seminar zeigt frei/voll).
 * Phase 3: Begruendung + Bestaetigung -> POST /api/contacts/<pid>/buchung.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Seminar {
  id: number;
  name: string;
  typ: "reihe" | "event";
  von: string | null;
  bis: string | null;
  termine_count?: number;
  max_registration?: number;
  aktive?: number;
  frei?: number | null;
  voll?: boolean;
}

interface Snapshot {
  ok: boolean;
  event_id?: number;
  event_name?: string;
  max_registration?: number;
  aktive?: number;
  frei?: number | null;
  voll?: boolean;
  error?: string;
}

const DEBOUNCE_MS = 350;

export default function SeminarBookingModal({
  personId,
  personName,
  open,
  onClose,
  onSuccess,
}: {
  personId: number;
  personName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Seminar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Seminar | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  // Reset wenn Modal aufgeht
  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setSelected(null);
      setSnapshot(null);
      setReason("");
      setError(null);
    }
  }, [open]);

  // Debounced Search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void runSearch(q.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  const runSearch = useCallback(async (query: string) => {
    if (inflight.current) inflight.current.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      params.set("limit", "30");
      const res = await fetch(`/cashflow/api/seminars/search?${params}`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        seminars?: Seminar[];
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setResults(json.seminars ?? []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Snapshot laden, wenn etwas ausgewaehlt wurde (nur fuer Events --
  // Reihen liefern keinen direkten Belegungs-Snapshot)
  useEffect(() => {
    setSnapshot(null);
    if (!selected || selected.typ !== "event") return;
    void (async () => {
      setSnapLoading(true);
      try {
        const res = await fetch(
          `/cashflow/api/seminars/${selected.id}/snapshot`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as Snapshot;
        setSnapshot(json);
      } catch (err) {
        setSnapshot({ ok: false, error: (err as Error).message });
      } finally {
        setSnapLoading(false);
      }
    })();
  }, [selected]);

  const submit = useCallback(async () => {
    if (!selected) return;
    if (reason.trim().length < 5) {
      setError("Bitte einen Grund (mind. 5 Zeichen) angeben.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/cashflow/api/contacts/${personId}/buchung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selected.id,
          reason: reason.trim(),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        mode?: string;
        already_active?: boolean;
        event_name?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [selected, reason, personId, onSuccess, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">In Seminar einbuchen</h2>
            <p className="text-xs text-[color:var(--muted)] mt-0.5">
              {personName} (PersonID {personId})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-xl"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* Search */}
          <div>
            <label className="text-xs uppercase tracking-wide text-[color:var(--muted)] block mb-1">
              Seminar suchen
            </label>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={'Name (z. B. „Mentalcoach")'}
              className="block w-full border border-[color:var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
              autoFocus
            />
          </div>

          {error ? (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          {/* Result list */}
          {selected ? null : (
            <div className="border border-[color:var(--border)] rounded-md max-h-72 overflow-auto divide-y divide-[color:var(--border)]">
              {loading ? (
                <div className="py-6 text-center text-xs text-[color:var(--muted)]">
                  Suche …
                </div>
              ) : results.length === 0 ? (
                <div className="py-6 text-center text-xs text-[color:var(--muted)]">
                  {q ? "Keine Treffer." : "Tippe um zu suchen."}
                </div>
              ) : (
                results.map((s) => (
                  <button
                    key={`${s.typ}-${s.id}`}
                    type="button"
                    onClick={() => setSelected(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-[color:var(--brand-yellow)]/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{s.name}</div>
                      <span
                        className={
                          "text-[10px] px-1.5 py-0.5 rounded font-semibold " +
                          (s.typ === "reihe"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-emerald-100 text-emerald-700")
                        }
                      >
                        {s.typ === "reihe" ? "Reihe" : "Seminar"}
                      </span>
                    </div>
                    <div className="text-xs text-[color:var(--muted)] mt-0.5">
                      ID {s.id}
                      {s.von ? ` · ab ${fmtDate(s.von)}` : ""}
                      {s.bis ? ` · bis ${fmtDate(s.bis)}` : ""}
                      {s.termine_count
                        ? ` · ${s.termine_count} Modul-Termine`
                        : ""}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selected */}
          {selected ? (
            <div className="border border-[color:var(--border)] rounded-md p-3 bg-[color:var(--brand-yellow)]/10">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{selected.name}</div>
                  <div className="text-xs text-[color:var(--muted)] mt-0.5">
                    ID {selected.id}
                    {selected.von ? ` · ${fmtDate(selected.von)}` : ""}
                    {selected.bis ? ` – ${fmtDate(selected.bis)}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs underline text-[color:var(--brand-blue)]"
                >
                  Andere auswählen
                </button>
              </div>

              {/* Belegungs-Status */}
              {selected.typ === "event" ? (
                <div className="mt-3">
                  {snapLoading ? (
                    <div className="text-xs text-[color:var(--muted)]">
                      Belegung wird geladen …
                    </div>
                  ) : snapshot?.ok ? (
                    <BelegungsBadge snap={snapshot} />
                  ) : snapshot && !snapshot.ok ? (
                    <div className="text-xs text-amber-700">
                      Belegung konnte nicht geladen werden:{" "}
                      {snapshot.error ?? "unbekannt"}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-xs text-[color:var(--muted)]">
                  Reihe: Belegung wird beim Hinzufügen automatisch
                  geprüft.
                </div>
              )}
            </div>
          ) : null}

          {/* Reason */}
          {selected ? (
            <div>
              <label className="text-xs uppercase tracking-wide text-[color:var(--muted)] block mb-1">
                Grund (Audit-Log)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z. B. Nachbuchung nach Telefonat"
                className="block w-full border border-[color:var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
              />
            </div>
          ) : null}
        </div>

        <div className="px-5 py-3 border-t border-[color:var(--border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded border border-[color:var(--border)] text-sm"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selected || submitting || reason.trim().length < 5}
            className={
              "px-4 py-1.5 rounded text-sm font-semibold " +
              (!selected || submitting || reason.trim().length < 5
                ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
                : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
            }
          >
            {submitting ? "Buche ein …" : "Einbuchen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BelegungsBadge({ snap }: { snap: Snapshot }) {
  const max = snap.max_registration ?? 0;
  const akt = snap.aktive ?? 0;
  const frei = snap.frei;
  const voll = !!snap.voll;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[color:var(--muted)]">Belegung:</span>
      <span className="font-medium tabular-nums">
        {akt}/{max || "?"}
      </span>
      {voll ? (
        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
          AUSGEBUCHT
        </span>
      ) : frei != null && frei <= 3 && frei > 0 ? (
        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
          {frei} frei
        </span>
      ) : frei != null && frei > 0 ? (
        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">
          {frei} frei
        </span>
      ) : null}
    </div>
  );
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  // YYYY-MM-DD -> DD.MM.YYYY
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}
