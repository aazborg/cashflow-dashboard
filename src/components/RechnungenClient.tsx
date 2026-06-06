"use client";
import { useCallback, useEffect, useState } from "react";
import MatchTransactionModal from "./MatchTransactionModal";

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

// Filter-Tabs. Default = "offen" damit die Liste sofort nutzbar ist —
// rejected/duplikat sollen nicht im Standard-View den Blick versperren.
const STATUS_FILTERS = [
  { key: "offen", label: "Offen" },
  { key: "bezahlt", label: "Bezahlt" },
  { key: "zugeordnet", label: "Zugeordnet" },
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
  const [status, setStatus] = useState("offen");
  const [q, setQ] = useState("");
  const [matchInvoice, setMatchInvoice] = useState<Invoice | null>(null);

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
      // Defensiv: Vercel kann bei Function-Timeout HTML statt JSON liefern.
      // Vorher als Text lesen, dann JSON-Parse versuchen — sonst sehen
      // wir nur "SyntaxError: Unexpected token 'A'" ohne Kontext.
      const raw = await res.text();
      let j: { ok?: boolean; invoices?: Invoice[]; error?: string } | null = null;
      try { j = JSON.parse(raw); } catch {}
      if (!j) {
        const head = raw.replace(/\s+/g, " ").trim().slice(0, 120);
        setError(`HTTP ${res.status} (keine JSON-Antwort) — ${head || "leer"}`);
        setRows([]);
        return;
      }
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
                    ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)] text-white"
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

      {/* Verworfene / Duplikate: kompakte Diagnose-Ansicht */}
      {(status === "rejected" || status === "duplikat") ? (
        <RejectedList
          rows={rows}
          loading={loading}
          error={error}
          onReactivated={() => void load()}
        />
      ) : (
        <FullInvoiceTable
          rows={rows}
          loading={loading}
          error={error}
          onStartMatch={(inv) => setMatchInvoice(inv)}
        />
      )}

      {matchInvoice && (
        <MatchTransactionModal
          invoice={matchInvoice}
          onClose={() => setMatchInvoice(null)}
          onSuccess={() => {
            setMatchInvoice(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function FullInvoiceTable({
  rows,
  loading,
  error,
  onStartMatch,
}: {
  rows: Invoice[];
  loading: boolean;
  error: string | null;
  onStartMatch: (inv: Invoice) => void;
}) {
  return (
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
                  Keine Rechnungen in dieser Sicht.
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
                    <div className="flex items-center gap-2">
                      <span className={"text-xs px-2 py-0.5 rounded " + lab.tone}>
                        {lab.label}
                      </span>
                      {lowConf && (
                        <span className="text-xs text-amber-700" title="Niedrige Parser-Konfidenz">
                          ❓
                        </span>
                      )}
                      {r.status === "offen" && (
                        <button
                          type="button"
                          onClick={() => onStartMatch(r)}
                          className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] text-[color:var(--brand-blue)] hover:bg-[color:var(--surface)]"
                          title="Bank-Buchung zuordnen"
                        >
                          🔗
                        </button>
                      )}
                    </div>
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
  );
}

function RejectedList({
  rows,
  loading,
  error,
  onReactivated,
}: {
  rows: Invoice[];
  loading: boolean;
  error: string | null;
  onReactivated: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reactivate = useCallback(
    async (inv: Invoice) => {
      const label =
        inv.lieferant_name ??
        inv.drive_filename ??
        inv.rechnung_nr ??
        "Rechnung";
      if (
        !confirm(
          `"${label}" als echte Rechnung markieren? Sie wird in 'Offen' verschoben und kann normal gematched werden.`,
        )
      )
        return;
      setBusyId(inv.id);
      setActionError(null);
      try {
        const res = await fetch(
          `/cashflow/api/buchhaltung/invoice/${inv.id}/status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "offen" }),
          },
        );
        const j = await res.json();
        if (!res.ok || !j.ok) {
          setActionError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        onReactivated();
      } catch (e) {
        setActionError(String(e));
      } finally {
        setBusyId(null);
      }
    },
    [onReactivated],
  );

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
      {error && (
        <div className="px-4 py-6 text-center text-red-600">{error}</div>
      )}
      {actionError && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
          {actionError}
        </div>
      )}
      {!error && loading && rows.length === 0 && (
        <div className="px-4 py-6 text-center text-[color:var(--muted)]">
          Lade…
        </div>
      )}
      {!error && !loading && rows.length === 0 && (
        <div className="px-4 py-6 text-center text-[color:var(--muted)]">
          Keine Einträge in dieser Sicht.
        </div>
      )}
      <ul className="divide-y divide-[color:var(--border)]">
        {rows.map((r) => {
          const conf = r.parser_confidence ?? 0;
          const warn = r.parser_warnings ?? [];
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.drive_filename ?? r.lieferant_name ?? "(Datei ohne Name)"}
                  </div>
                  <div className="text-xs text-[color:var(--muted)] mt-0.5">
                    {r.lieferant_name && (
                      <span>Erkannt als: {r.lieferant_name}</span>
                    )}
                    {r.rechnung_nr && <span> · RG-Nr {r.rechnung_nr}</span>}
                    {r.brutto != null && (
                      <span> · Betrag {eur(r.brutto, r.waehrung ?? "EUR")}</span>
                    )}
                    {r.rechnungsdatum && (
                      <span> · Datum {r.rechnungsdatum}</span>
                    )}
                  </div>
                  {warn.length > 0 && (
                    <div className="mt-1 text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded">
                      ⚠️ {warn[0]}
                      {warn.length > 1 && (
                        <span className="text-[color:var(--muted)]">
                          {" "}
                          +{warn.length - 1} weitere
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right whitespace-nowrap flex flex-col items-end gap-1.5">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    Konfidenz {(conf * 100).toFixed(0)}%
                  </span>
                  {r.drive_file_url && (
                    <a
                      href={r.drive_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 underline text-xs"
                    >
                      PDF öffnen
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void reactivate(r)}
                    disabled={busyId !== null}
                    className="text-xs px-2 py-1 rounded bg-[color:var(--brand-orange)] text-white font-medium disabled:opacity-50"
                  >
                    {busyId === r.id ? "…" : "Doch echte Rechnung"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
