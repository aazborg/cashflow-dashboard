"use client";

/**
 * Zertifikats-Tab: liest aus public.zertifikate.
 * Multi-Select + Bulk-PDF-Druck (oeffnet pro Auswahl ein neues
 * Tab mit der PDF-Export-URL des Google-Docs).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ZertEntry {
  id: string;
  google_doc_id: string;
  name: string;
  google_doc_url: string | null;
  google_pdf_url: string | null;
  teilnehmer_name: string | null;
  teilnehmer_email: string | null;
  seminar_titel: string | null;
  created_at_drive: string | null;
  modified_at_drive: string | null;
  gedruckt_am: string | null;
  versendet_am: string | null;
  notiz: string | null;
  erledigt_am: string | null;
  erledigt_von: string | null;
}

const DEBOUNCE_MS = 300;

export default function ZertifikateList() {
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<ZertEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [hideErledigt, setHideErledigt] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async (query: string) => {
    if (inflight.current) inflight.current.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      params.set("limit", "500");
      const res = await fetch(`/cashflow/api/zertifikate?${params}`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        entries?: ZertEntry[];
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
      void load(q.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, load]);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/cashflow/api/zertifikate`, {
        method: "POST",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        seen?: number;
        upserted?: number;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSyncResult(
        `${json.upserted ?? 0} synchronisiert (${json.seen ?? 0} im Drive)`,
      );
      void load(q.trim());
    } catch (err) {
      setSyncResult(`Fehler: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }, [load, q]);

  const visibleEntries = useMemo(
    () =>
      hideErledigt ? entries.filter((e) => !e.erledigt_am) : entries,
    [entries, hideErledigt],
  );

  const allChecked = useMemo(
    () =>
      visibleEntries.length > 0 &&
      visibleEntries.every((e) => selected.has(e.id)),
    [visibleEntries, selected],
  );

  const toggleAll = useCallback(() => {
    setSelected((cur) => {
      if (visibleEntries.every((e) => cur.has(e.id))) return new Set();
      const n = new Set(cur);
      visibleEntries.forEach((e) => n.add(e.id));
      return n;
    });
  }, [visibleEntries]);

  const bulkUpdate = useCallback(
    async (action: "erledigt" | "wieder_offen") => {
      const ids = [...selected];
      if (ids.length === 0) return;
      setBulkBusy(true);
      try {
        const res = await fetch(`/cashflow/api/zertifikate/bulk-update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, action }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        const ts = new Date().toISOString();
        setEntries((prev) =>
          prev.map((e) =>
            selected.has(e.id)
              ? {
                  ...e,
                  erledigt_am: action === "erledigt" ? ts : null,
                  erledigt_von: action === "erledigt" ? "you" : null,
                }
              : e,
          ),
        );
        if (action === "erledigt") setSelected(new Set());
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBulkBusy(false);
      }
    },
    [selected],
  );

  const toggleOne = useCallback((id: string) => {
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const printSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      // Bot merged alle Zertifikate zu EINEM PDF und liefert es
      // als Stream. Wir oeffnen den Blob in einem neuen Tab --
      // genau 1 window.open() pro Click, kein Popup-Blocker-Problem.
      const res = await fetch(`/cashflow/api/zertifikate/bulk-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const txt = await res.text();
        try {
          const j = JSON.parse(txt) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        } catch {
          throw new Error(`HTTP ${res.status}`);
        }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener");
      // Versuche Print-Dialog direkt anzustossen (best effort --
      // klappt nur wenn Popup-Blocker es zulaesst)
      if (win) {
        win.addEventListener("load", () => {
          try {
            win.focus();
            win.print();
          } catch {
            /* ignore */
          }
        });
      }
      // URL nach 1 Min wieder freigeben
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      // Auto-Mark als erledigt
      try {
        await fetch(`/cashflow/api/zertifikate/bulk-update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, action: "erledigt" }),
        });
        const ts = new Date().toISOString();
        setEntries((prev) =>
          prev.map((e) =>
            selected.has(e.id)
              ? { ...e, erledigt_am: ts, erledigt_von: "you" }
              : e,
          ),
        );
        setSelected(new Set());
      } catch {
        /* best effort */
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }, [selected]);

  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen: Name, E-Mail, Seminartitel …"
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
        <button
          type="button"
          onClick={triggerSync}
          disabled={syncing}
          className={
            "px-2.5 py-1.5 rounded-md text-sm font-semibold " +
            (syncing
              ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-wait"
              : "border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30")
          }
          title="Holt die aktuellen Dateien aus dem Drive-Folder"
        >
          {syncing ? "Sync …" : "Aus Drive aktualisieren"}
        </button>
        <button
          type="button"
          onClick={printSelected}
          disabled={selected.size === 0 || bulkBusy}
          className={
            "px-3 py-1.5 rounded-md text-sm font-semibold " +
            (selected.size === 0 || bulkBusy
              ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
              : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
          }
        >
          Drucken ({selected.size})
        </button>
        <button
          type="button"
          onClick={() => bulkUpdate("erledigt")}
          disabled={selected.size === 0 || bulkBusy}
          className={
            "px-3 py-1.5 rounded-md text-sm font-semibold " +
            (selected.size === 0 || bulkBusy
              ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
              : "bg-emerald-600 text-white hover:opacity-90")
          }
          title="Markiert die ausgewaehlten als erledigt"
        >
          ✓ Erledigt ({selected.size})
        </button>
        <button
          type="button"
          onClick={() => bulkUpdate("wieder_offen")}
          disabled={selected.size === 0 || bulkBusy}
          className={
            "px-3 py-1.5 rounded-md text-sm font-semibold " +
            (selected.size === 0 || bulkBusy
              ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
              : "border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30")
          }
          title="Setzt die ausgewaehlten wieder auf offen"
        >
          ↺ Wieder öffnen
        </button>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={hideErledigt}
            onChange={(e) => setHideErledigt(e.target.checked)}
            className="accent-[color:var(--brand-orange)]"
          />
          <span>Erledigte ausblenden</span>
        </label>
        <div className="text-xs text-[color:var(--muted)] tabular-nums">
          {loading
            ? "Lade …"
            : hideErledigt
            ? `${visibleEntries.length} / ${entries.length}`
            : `${entries.length}`}{" "}
          Zertifikate
        </div>
      </div>

      {syncResult ? (
        <div className="rounded border border-[color:var(--border)] bg-[color:var(--brand-yellow)]/10 px-3 py-2 text-xs mb-3">
          {syncResult}
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 mb-3">
          {error}
        </div>
      ) : null}

      {visibleEntries.length === 0 && !loading ? (
        <div className="py-10 text-center text-sm text-[color:var(--muted)]">
          {entries.length === 0
            ? `Keine Zertifikate gefunden. Klick „Aus Drive aktualisieren".`
            : "Keine offenen Zertifikate (alle erledigt)."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                <th className="py-2 px-2 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="accent-[color:var(--brand-orange)]"
                    title="Alle/keine markieren"
                  />
                </th>
                <th className="text-left py-2 pr-3 font-semibold">Datei</th>
                <th className="text-left py-2 pr-3 font-semibold">Person</th>
                <th className="text-left py-2 pr-3 font-semibold">Seminar</th>
                <th className="text-left py-2 pr-3 font-semibold">Erstellt</th>
                <th className="text-left py-2 pr-3 font-semibold">Status</th>
                <th className="text-right py-2 font-semibold w-32">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((z) => {
                const isSel = selected.has(z.id);
                const isErledigt = !!z.erledigt_am;
                const rowBg = isErledigt
                  ? "bg-emerald-50"
                  : isSel
                  ? "bg-[color:var(--brand-yellow)]/10"
                  : "";
                return (
                  <tr
                    key={z.id}
                    className={
                      "border-b border-[color:var(--border)]/60 transition-colors " +
                      rowBg
                    }
                  >
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleOne(z.id)}
                        className="accent-[color:var(--brand-orange)]"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div
                        className="text-sm font-medium truncate max-w-[260px]"
                        title={z.name}
                      >
                        {z.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-sm">{z.teilnehmer_name || "—"}</div>
                      {z.teilnehmer_email ? (
                        <div className="text-[11px] text-[color:var(--muted)] truncate max-w-[180px]">
                          {z.teilnehmer_email}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-sm truncate max-w-[200px]">
                      {z.seminar_titel || "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[color:var(--muted)] tabular-nums whitespace-nowrap">
                      {fmtDate(z.created_at_drive ?? z.modified_at_drive)}
                    </td>
                    <td className="py-2 pr-3">
                      {isErledigt ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold"
                          title={`Erledigt ${fmtDate(z.erledigt_am)}${
                            z.erledigt_von ? ` von ${z.erledigt_von}` : ""
                          }`}
                        >
                          ✓ erledigt
                        </span>
                      ) : (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold inline-block">
                          offen
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {z.google_doc_url ? (
                        <a
                          href={z.google_doc_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2 py-0.5 rounded border border-[color:var(--brand-blue)]/40 text-[color:var(--brand-blue)] hover:bg-blue-50 font-semibold mr-1"
                        >
                          Öffnen
                        </a>
                      ) : null}
                      {z.google_pdf_url ? (
                        <a
                          href={z.google_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2 py-0.5 rounded border border-[color:var(--brand-orange)]/40 text-[color:var(--brand-orange)] hover:bg-amber-50 font-semibold"
                        >
                          PDF
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
