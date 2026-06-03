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

  const allChecked = useMemo(
    () => entries.length > 0 && entries.every((e) => selected.has(e.id)),
    [entries, selected],
  );

  const toggleAll = useCallback(() => {
    setSelected((cur) => {
      if (entries.every((e) => cur.has(e.id))) return new Set();
      const n = new Set(cur);
      entries.forEach((e) => n.add(e.id));
      return n;
    });
  }, [entries]);

  const toggleOne = useCallback((id: string) => {
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const printSelected = useCallback(() => {
    const picked = entries.filter((e) => selected.has(e.id));
    if (picked.length === 0) return;
    if (picked.length > 10) {
      if (
        !confirm(
          `Du druckst ${picked.length} Zertifikate. Pop-Up-Blocker müssen aus sein, sonst gehen einige Tabs nicht auf. Fortfahren?`,
        )
      )
        return;
    }
    for (const z of picked) {
      const url = z.google_pdf_url ?? z.google_doc_url;
      if (!url) continue;
      window.open(url, "_blank", "noopener");
    }
  }, [entries, selected]);

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
          disabled={selected.size === 0}
          className={
            "px-3 py-1.5 rounded-md text-sm font-semibold " +
            (selected.size === 0
              ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
              : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
          }
        >
          Drucken ({selected.size})
        </button>
        <div className="text-xs text-[color:var(--muted)] tabular-nums">
          {loading ? "Lade …" : `${entries.length} Zertifikate`}
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

      {entries.length === 0 && !loading ? (
        <div className="py-10 text-center text-sm text-[color:var(--muted)]">
          Keine Zertifikate gefunden. Klick „Aus Drive aktualisieren".
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
                <th className="text-right py-2 font-semibold w-32">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((z) => {
                const isSel = selected.has(z.id);
                return (
                  <tr
                    key={z.id}
                    className={
                      "border-b border-[color:var(--border)]/60 " +
                      (isSel ? "bg-[color:var(--brand-yellow)]/10" : "")
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
