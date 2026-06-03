"use client";

/**
 * Liste aller Umbuchungen mit Suchfeld + Rueckgaengig-Funktion.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface UmbuchungEntry {
  id: string;
  person_id: number;
  person_name: string | null;
  person_email: string | null;
  old_event_id: number;
  old_event_name: string | null;
  new_event_id: number;
  new_event_name: string | null;
  is_lsb_praxis: boolean;
  gebuehrenpflichtig: boolean;
  gebuehr_erlassen: boolean;
  kunde_informiert: boolean;
  simplyorg_rechnung_id: number | null;
  reason: string | null;
  by_email: string | null;
  created_at: string;
  rueckgaengig_gemacht_am: string | null;
  rueckgaengig_gemacht_von: string | null;
  rueckgaengig_grund: string | null;
}

const DEBOUNCE_MS = 300;

export default function UmbuchungenList() {
  const [q, setQ] = useState("");
  const [includeReverted, setIncludeReverted] = useState(false);
  const [entries, setEntries] = useState<UmbuchungEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [revertSubmitting, setRevertSubmitting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async (query: string, withReverted: boolean) => {
    if (inflight.current) inflight.current.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (withReverted) params.set("include_reverted", "1");
      params.set("limit", "500");
      const res = await fetch(`/cashflow/api/umbuchungen?${params}`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        entries?: UmbuchungEntry[];
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setEntries(json.entries ?? []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load(q.trim(), includeReverted);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, includeReverted, load]);

  const submitRevert = useCallback(async () => {
    if (!revertingId) return;
    if (revertReason.trim().length < 5) {
      setRevertError("Grund (mind. 5 Zeichen) erforderlich.");
      return;
    }
    setRevertSubmitting(true);
    setRevertError(null);
    try {
      const res = await fetch(
        `/cashflow/api/umbuchungen/${revertingId}/rueckgaengig`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: revertReason.trim() }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setRevertingId(null);
      setRevertReason("");
      void load(q.trim(), includeReverted);
    } catch (err) {
      setRevertError((err as Error).message);
    } finally {
      setRevertSubmitting(false);
    }
  }, [revertingId, revertReason, q, includeReverted, load]);

  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen: Name, E-Mail, Seminar …"
            className="block w-full border border-[color:var(--border)] rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
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
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={includeReverted}
            onChange={(e) => setIncludeReverted(e.target.checked)}
            className="accent-[color:var(--brand-orange)]"
          />
          <span>Bereits rückgängig gemachte anzeigen</span>
        </label>
        <div className="text-xs text-[color:var(--muted)] tabular-nums">
          {loading ? "Lade …" : `${entries.length} Einträge`}
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 mb-3">
          {error}
        </div>
      ) : null}

      {entries.length === 0 && !loading ? (
        <div className="py-10 text-center text-sm text-[color:var(--muted)]">
          Keine Umbuchungen gefunden.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                <th className="text-left py-2 pr-3 font-semibold">Datum</th>
                <th className="text-left py-2 pr-3 font-semibold">Person</th>
                <th className="text-left py-2 pr-3 font-semibold">Von</th>
                <th className="text-left py-2 pr-3 font-semibold">Nach</th>
                <th className="text-left py-2 pr-3 font-semibold">Status</th>
                <th className="text-left py-2 pr-3 font-semibold">Grund</th>
                <th className="text-right py-2 pr-3 font-semibold">Von</th>
                <th className="text-right py-2 font-semibold w-24">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const reverted = !!e.rueckgaengig_gemacht_am;
                return (
                  <tr
                    key={e.id}
                    className={
                      "border-b border-[color:var(--border)]/60 " +
                      (reverted ? "opacity-50" : "")
                    }
                  >
                    <td className="py-2 pr-3 text-xs whitespace-nowrap tabular-nums">
                      {fmtDateTime(e.created_at)}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-sm">
                        {e.person_name || `Person ${e.person_id}`}
                      </div>
                      {e.person_email ? (
                        <div className="text-[11px] text-[color:var(--muted)] truncate">
                          {e.person_email}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <div className="truncate max-w-[180px]" title={e.old_event_name ?? ""}>
                        {e.old_event_name || "—"}
                      </div>
                      <div className="text-[10px] text-[color:var(--muted)]">
                        ID {e.old_event_id}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <div className="truncate max-w-[180px]" title={e.new_event_name ?? ""}>
                        {e.new_event_name || "—"}
                      </div>
                      <div className="text-[10px] text-[color:var(--muted)]">
                        ID {e.new_event_id}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-0.5">
                        {reverted ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold inline-block w-fit">
                            zurückgenommen
                          </span>
                        ) : null}
                        {e.is_lsb_praxis ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold inline-block w-fit">
                            LSB-Praxis
                          </span>
                        ) : null}
                        {e.gebuehrenpflichtig ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold inline-block w-fit">
                            Gebühr 70€
                          </span>
                        ) : null}
                        {e.gebuehr_erlassen ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold inline-block w-fit">
                            erlassen
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-[color:var(--muted)] max-w-[200px]">
                      <div className="truncate" title={e.reason ?? ""}>
                        {e.reason || "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-[11px] text-[color:var(--muted)] truncate max-w-[140px]">
                      {e.by_email || "—"}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {reverted ? (
                        <span
                          className="text-[10px] text-[color:var(--muted)]"
                          title={`${fmtDateTime(e.rueckgaengig_gemacht_am)} · ${e.rueckgaengig_gemacht_von ?? ""}`}
                        >
                          ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRevertingId(e.id);
                            setRevertReason("");
                            setRevertError(null);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded border border-amber-300 text-amber-800 hover:bg-amber-50 font-semibold"
                        >
                          Rückgängig
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm-Modal */}
      {revertingId ? (
        <RevertModal
          entry={entries.find((x) => x.id === revertingId) ?? null}
          reason={revertReason}
          setReason={setRevertReason}
          submitting={revertSubmitting}
          error={revertError}
          onCancel={() => setRevertingId(null)}
          onSubmit={submitRevert}
        />
      ) : null}
    </div>
  );
}

function RevertModal({
  entry,
  reason,
  setReason,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  entry: UmbuchungEntry | null;
  reason: string;
  setReason: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  if (!entry) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !submitting && onCancel()}
    >
      <div
        className="bg-white rounded-lg max-w-lg w-full p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 className="text-lg font-bold">Umbuchung rückgängig machen?</h3>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          <strong>
            {entry.person_name || `Person ${entry.person_id}`}
          </strong>{" "}
          wird aus „{entry.new_event_name || `Event ${entry.new_event_id}`}"
          storniert und in „
          {entry.old_event_name || `Event ${entry.old_event_id}`}" wieder
          eingebucht.
        </p>
        {entry.gebuehrenpflichtig && !entry.gebuehr_erlassen ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ Diese Umbuchung war gebührenpflichtig (70€). Wenn schon eine
            Rechnung angelegt wurde, musst du sie ggf. manuell stornieren.
            {entry.simplyorg_rechnung_id ? (
              <div className="mt-1">
                SimplyOrg-Rechnung: {entry.simplyorg_rechnung_id}
              </div>
            ) : null}
          </div>
        ) : null}
        <label className="text-xs uppercase tracking-wide text-[color:var(--muted)] block mt-4 mb-1">
          Grund (Audit-Log) *
        </label>
        <input
          type="text"
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
          placeholder="z. B. versehentlich umgebucht"
          autoFocus
          className={
            "block w-full border rounded-md px-3 py-2 text-sm outline-none " +
            (reason.trim().length >= 5
              ? "border-[color:var(--border)] focus:border-[color:var(--brand-blue)]"
              : "border-amber-300 focus:border-amber-500 bg-amber-50/40")
          }
        />
        {reason.trim().length < 5 ? (
          <div className="text-[11px] text-amber-700 mt-1">
            mindestens 5 Zeichen ({reason.trim().length}/5)
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded border border-[color:var(--border)] text-sm"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || reason.trim().length < 5}
            className={
              "px-4 py-1.5 rounded text-sm font-semibold " +
              (submitting || reason.trim().length < 5
                ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
                : "bg-amber-600 text-white hover:opacity-90")
            }
          >
            {submitting ? "Mache rückgängig …" : "Rückgängig machen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
