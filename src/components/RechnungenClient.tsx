"use client";
import { useCallback, useEffect, useState } from "react";

const API = "/cashflow/api/buchhaltung";

type Invoice = {
  id: string;
  inbox_email_id: string | null;
  drive_file_id: string | null;
  drive_file_url: string | null;
  drive_filename: string | null;
  lieferant_name: string | null;
  rechnung_nr: string | null;
  rechnungsdatum: string | null;
  faelligkeit: string | null;
  netto: number | null;
  ust_summe: number | null;
  brutto: number | null;
  waehrung: string | null;
  iban: string | null;
  verwendungszweck: string | null;
  status: string;
  parser_confidence: number | null;
  parser_warnings: string[] | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  offen: { label: "offen", tone: "bg-amber-100 text-amber-800" },
  zugeordnet: { label: "zugeordnet", tone: "bg-sky-100 text-sky-800" },
  bezahlt: { label: "bezahlt", tone: "bg-emerald-100 text-emerald-800" },
  duplikat: { label: "Duplikat", tone: "bg-gray-200 text-gray-700" },
  rejected: { label: "verworfen", tone: "bg-gray-100 text-gray-500" },
};

const STATUS_FILTERS = [
  { key: "", label: "Alle aktiven" },
  { key: "offen", label: "Offen" },
  { key: "zugeordnet", label: "Zugeordnet" },
  { key: "bezahlt", label: "Bezahlt" },
  { key: "duplikat", label: "Duplikate" },
  { key: "rejected", label: "Verworfene" },
];

function eur(v: number | null | undefined, w = "EUR") {
  if (v == null) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: w || "EUR",
  }).format(Number(v));
}

export default function RechnungenClient() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`${API}/invoices?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(j.invoices ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const summe = rows.reduce((s, r) => s + (Number(r.brutto) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-end justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={
                  "text-xs px-2 py-1 rounded border transition " +
                  (status === f.key
                    ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                    : "border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche Lieferant oder RG-Nr…"
            className="px-2 py-1 rounded border border-[color:var(--border)] bg-white text-sm w-64"
          />
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {rows.length} Rechnungen · Summe Brutto: <strong>{eur(summe)}</strong>
        </div>
      </div>

      <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Datum</th>
                <th className="px-3 py-2 font-medium">Lieferant</th>
                <th className="px-3 py-2 font-medium">RG-Nr</th>
                <th className="px-3 py-2 font-medium text-right">Netto</th>
                <th className="px-3 py-2 font-medium text-right">USt</th>
                <th className="px-3 py-2 font-medium text-right">Brutto</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Fällig</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">PDF</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-red-600">
                    {error}
                  </td>
                </tr>
              )}
              {!error && loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Lade…
                  </td>
                </tr>
              )}
              {!error && !loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Keine Rechnungen — der Posteingang läuft alle 15 Min.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const lab = STATUS_LABELS[r.status] ?? {
                  label: r.status,
                  tone: "bg-gray-100 text-gray-700",
                };
                const lowConf =
                  r.parser_confidence != null && r.parser_confidence < 0.7;
                return (
                  <tr key={r.id} className="border-t border-[color:var(--border)] align-top">
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                      {r.rechnungsdatum ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div>{r.lieferant_name ?? "—"}</div>
                      {(r.parser_warnings?.length ?? 0) > 0 && (
                        <div
                          className="text-xs text-amber-700 mt-0.5 line-clamp-1"
                          title={r.parser_warnings?.join("\n")}
                        >
                          ⚠️ {r.parser_warnings![0]}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.rechnung_nr ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {eur(r.netto, r.waehrung ?? "EUR")}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-[color:var(--muted)]">
                      {eur(r.ust_summe, r.waehrung ?? "EUR")}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">
                      {eur(r.brutto, r.waehrung ?? "EUR")}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                      {r.faelligkeit ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={"text-xs px-2 py-0.5 rounded " + lab.tone}>
                        {lab.label}
                      </span>
                      {lowConf && (
                        <span className="ml-1 text-xs text-amber-700" title="Niedrige Parser-Konfidenz">
                          ❓
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.drive_file_url ? (
                        <a
                          href={r.drive_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-700 underline text-xs"
                        >
                          öffnen
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
