"use client";
import { useCallback, useEffect, useState } from "react";
import MatchInvoiceModal from "./MatchInvoiceModal";

const API = "/cashflow/api/buchhaltung";

type Txn = {
  id: string;
  booking_date: string;
  value_date: string | null;
  amount: number;
  waehrung: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  purpose: string | null;
  status: string;
  accounting_bank_accounts?: { bezeichnung: string; quelle: string } | null;
};

type Overview = { bezahlt: number; offen: number; unbekannt: number };

const ACCOUNTS = [
  { slug: "erste_giro", label: "Erste Bank Girokonto" },
  { slug: "erste_kk", label: "Erste Bank Kreditkarte" },
  { slug: "amex", label: "American Express" },
  { slug: "paypal", label: "PayPal Business" },
  { slug: "gocardless", label: "GoCardless Payouts" },
];

function eur(v: number, w = "EUR") {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: w || "EUR",
  }).format(Number(v) || 0);
}

export default function KontoauszuegeClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [account, setAccount] = useState("erste_giro");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string | null>(null);
  const [manualTrx, setManualTrx] = useState<Txn | null>(null);
  // Progress: 0..100 fuer Upload, dann -1 = "Bot parst"
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStage, setUploadStage] = useState<string>("");
  // Filter
  const [quelleFilter, setQuelleFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const txParams = new URLSearchParams({ limit: "500" });
      if (statusFilter) txParams.set("status", statusFilter);
      if (quelleFilter) txParams.set("quelle", quelleFilter);
      if (dateFrom) txParams.set("from", dateFrom);
      if (dateTo) txParams.set("to", dateTo);
      const [ovRes, txRes] = await Promise.all([
        fetch(`${API}/match-overview`, { cache: "no-store" }),
        fetch(`${API}/transactions?${txParams.toString()}`, { cache: "no-store" }),
      ]);
      const ov = await ovRes.json();
      const tx = await txRes.json();
      if (ov.ok)
        setOverview({
          bezahlt: ov.bezahlt,
          offen: ov.offen,
          unbekannt: ov.unbekannt,
        });
      if (tx.ok) setTxns(tx.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, quelleFilter, dateFrom, dateTo]);

  const ignoreTrx = useCallback(
    async (t: Txn) => {
      const name = t.counterparty_name || t.purpose?.slice(0, 30) || "Buchung";
      const remember = confirm(
        `"${name}" als 'kein Match nötig' markieren?\n\n` +
          `[OK] = auch bei zukünftigen Uploads automatisch ignorieren ` +
          `(z.B. Gehalt). Der Bot lernt.\n` +
          `[Abbrechen] = nichts tun.`,
      );
      if (!remember) return;
      try {
        const res = await fetch(
          `/cashflow/api/buchhaltung/transaction/${t.id}/ignore`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ remember: true }),
          },
        );
        const j = await res.json();
        if (!res.ok || !j.ok) {
          alert(`Fehler: ${j.error ?? res.status}`);
          return;
        }
        await loadAll();
      } catch (e) {
        alert(String(e));
      }
    },
    [loadAll],
  );

  const unignoreTrx = useCallback(
    async (id: string) => {
      try {
        await fetch(
          `/cashflow/api/buchhaltung/transaction/${id}/unignore`,
          { method: "POST" },
        );
        await loadAll();
      } catch (e) {
        alert(String(e));
      }
    },
    [loadAll],
  );

  // Monats-Schnellfilter: setzt from + to fuer Default-Monate
  const setMonthFilter = useCallback(
    (mode: "current" | "last" | "last3" | "year" | "all") => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const pad = (n: number) => String(n).padStart(2, "0");
      const iso = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (mode === "all") {
        setDateFrom("");
        setDateTo("");
        return;
      }
      if (mode === "current") {
        setDateFrom(iso(new Date(y, m, 1)));
        setDateTo(iso(new Date(y, m + 1, 0)));
        return;
      }
      if (mode === "last") {
        setDateFrom(iso(new Date(y, m - 1, 1)));
        setDateTo(iso(new Date(y, m, 0)));
        return;
      }
      if (mode === "last3") {
        setDateFrom(iso(new Date(y, m - 2, 1)));
        setDateTo(iso(new Date(y, m + 1, 0)));
        return;
      }
      if (mode === "year") {
        setDateFrom(iso(new Date(y, 0, 1)));
        setDateTo(iso(new Date(y, 11, 31)));
        return;
      }
    },
    [],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const uploadFile = useCallback(
    (file: File) => {
      return new Promise<void>((resolve) => {
        setUploading(true);
        setUploadMsg(null);
        setUploadProgress(0);
        setUploadStage("Datei wird hochgeladen…");

        const fd = new FormData();
        fd.append("file", file);
        fd.append("bank_account", account);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/kontoauszug/upload`);

        xhr.upload.addEventListener("progress", (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setUploadProgress(pct);
            if (pct >= 100) setUploadStage("Bot parst…");
          }
        });

        xhr.addEventListener("loadstart", () => {
          setUploadStage("Datei wird hochgeladen…");
        });

        xhr.addEventListener("load", async () => {
          try {
            const j = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && j.ok) {
              if (j.status === "duplicate") {
                setUploadMsg(
                  `Auszug schon importiert (${j.transactions_already} Buchungen vorhanden).`,
                );
              } else {
                setUploadMsg(
                  `OK — Format "${j.format}", ${j.transactions_total} Buchungen, ${j.transactions_new} neu importiert.`,
                );
                await loadAll();
              }
            } else {
              setUploadMsg(`Fehler: ${j.error ?? xhr.status}`);
            }
          } catch {
            setUploadMsg(`Fehler: HTTP ${xhr.status}`);
          } finally {
            setUploading(false);
            setUploadProgress(0);
            setUploadStage("");
            resolve();
          }
        });

        xhr.addEventListener("error", () => {
          setUploadMsg("Fehler beim Upload");
          setUploading(false);
          setUploadProgress(0);
          setUploadStage("");
          resolve();
        });

        xhr.send(fd);
      });
    },
    [account, loadAll],
  );

  const triggerMatch = useCallback(async () => {
    setMatching(true);
    setMatchMsg(null);
    try {
      const res = await fetch(`${API}/match-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit_trx: 500 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok)
        setMatchMsg(`Fehler: ${j.error ?? res.status}`);
      else
        setMatchMsg(
          `OK — ${j.matched_strong} stark + ${j.matched_loose} locker gematched aus ${j.trxs_checked} Buchungen.`,
        );
      await loadAll();
    } catch (e) {
      setMatchMsg(`Fehler: ${String(e)}`);
    } finally {
      setMatching(false);
    }
  }, [loadAll]);

  return (
    <div className="space-y-4">
      {/* Status-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatusCard
          label="Bezahlt"
          value={overview?.bezahlt ?? "—"}
          tone="emerald"
          hint="Rechnungen mit Match"
        />
        <StatusCard
          label="Offen"
          value={overview?.offen ?? "—"}
          tone="amber"
          hint="Rechnungen ohne Match"
        />
        <StatusCard
          label="Unbekannte Buchungen"
          value={overview?.unbekannt ?? "—"}
          tone="sky"
          hint="Bank-Buchungen ohne Rechnung"
        />
      </div>

      {/* Upload */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Konto</span>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="px-2 py-1.5 rounded border border-[color:var(--border)] bg-white text-sm min-w-[220px]"
            >
              {ACCOUNTS.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[260px]">
            <span className="text-xs text-[color:var(--muted)]">
              Datei (CSV / JSON / XML / PDF)
            </span>
            <input
              type="file"
              accept=".csv,.json,.xml,.pdf,.txt"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
                e.target.value = "";
              }}
              className="text-sm"
            />
          </label>
          <button
            type="button"
            onClick={triggerMatch}
            disabled={matching}
            className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-sm font-medium disabled:opacity-50"
          >
            {matching ? "Match läuft…" : "Auto-Match starten"}
          </button>
        </div>
        {uploading && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[color:var(--muted)]">{uploadStage}</span>
              <span className="text-[color:var(--muted)] tabular-nums">
                {uploadProgress < 100 ? `${uploadProgress}%` : "↻"}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[color:var(--surface)] overflow-hidden">
              <div
                className={
                  "h-full bg-[color:var(--brand-orange)] transition-all duration-150 " +
                  (uploadProgress >= 100 ? "animate-pulse" : "")
                }
                style={{
                  width: uploadProgress >= 100 ? "100%" : `${uploadProgress}%`,
                }}
              />
            </div>
          </div>
        )}
        {uploadMsg && !uploading && (
          <div className="text-xs text-[color:var(--muted)]">{uploadMsg}</div>
        )}
        {matchMsg && (
          <div className="text-xs text-[color:var(--muted)]">{matchMsg}</div>
        )}
        <div className="text-xs text-[color:var(--muted)]">
          Erste Bank Business: CSV-Export aus George. Erste KK: PDF-Auszug.
          AmEx: CSV oder PDF. PayPal: CSV-Export (alle Transaktionen).
          GoCardless: JSON aus API-Export.
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 space-y-3">
        {/* Zeile 1: Konto + Zeitraum-Quickfilter */}
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Konto</span>
            <select
              value={quelleFilter}
              onChange={(e) => setQuelleFilter(e.target.value)}
              className="px-2 py-1.5 rounded border border-[color:var(--border)] bg-white text-sm min-w-[200px]"
            >
              <option value="">Alle Konten</option>
              {ACCOUNTS.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Zeitraum</span>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  { k: "current", l: "Dieser Monat" },
                  { k: "last", l: "Letzter Monat" },
                  { k: "last3", l: "Letzte 3 Monate" },
                  { k: "year", l: "Dieses Jahr" },
                  { k: "all", l: "Alle" },
                ] as const
              ).map((m) => (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setMonthFilter(m.k)}
                  className="text-xs px-2 py-1 rounded border border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Zeile 2: feines Datum + Status */}
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Von</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1.5 rounded border border-[color:var(--border)] bg-white text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Bis</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1.5 rounded border border-[color:var(--border)] bg-white text-sm"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Status</span>
            <div className="flex gap-1 flex-wrap">
              {[
                { k: "", l: "Alle" },
                { k: "open", l: "Offen" },
                { k: "matched", l: "Gematched" },
                { k: "ignored", l: "Ignoriert" },
              ].map((f) => (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => setStatusFilter(f.k)}
                  className={
                    "text-xs px-2 py-1 rounded border transition " +
                    (statusFilter === f.k
                      ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)] text-white"
                      : "border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
                  }
                >
                  {f.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {loading
            ? "Lade…"
            : `${txns.length} Buchungen geladen${
                dateFrom || dateTo
                  ? ` · ${dateFrom || "Anfang"} bis ${dateTo || "heute"}`
                  : ""
              }`}
        </div>
      </div>

      {/* Manuell-Match Modal */}
      {manualTrx && (
        <MatchInvoiceModal
          trx={manualTrx}
          onClose={() => setManualTrx(null)}
          onSuccess={() => {
            setManualTrx(null);
            void loadAll();
          }}
        />
      )}

      {/* Transaktions-Tabelle */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Datum</th>
                <th className="px-3 py-2 font-medium">Konto</th>
                <th className="px-3 py-2 font-medium">Gegenpartei</th>
                <th className="px-3 py-2 font-medium">Verwendungszweck</th>
                <th className="px-3 py-2 font-medium text-right">Betrag</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && txns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Lade…
                  </td>
                </tr>
              )}
              {!loading && txns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Noch keine Buchungen. Lade einen Auszug hoch.
                  </td>
                </tr>
              )}
              {txns.map((t) => (
                <tr key={t.id} className="border-t border-[color:var(--border)] align-top">
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                    {t.booking_date}
                  </td>
                  <td className="px-3 py-2 text-xs text-[color:var(--muted)] whitespace-nowrap">
                    {t.accounting_bank_accounts?.bezeichnung ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {t.counterparty_name ?? "—"}
                    {t.counterparty_iban && (
                      <div className="text-xs font-mono text-[color:var(--muted)]">
                        {t.counterparty_iban}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="line-clamp-2">{t.purpose ?? "—"}</div>
                  </td>
                  <td
                    className={
                      "px-3 py-2 text-right whitespace-nowrap font-semibold " +
                      (t.amount < 0 ? "text-red-700" : "text-emerald-700")
                    }
                  >
                    {eur(t.amount, t.waehrung)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {t.status === "matched" ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        ✓ gematched
                      </span>
                    ) : t.status === "ignored" ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                          kein Match nötig
                        </span>
                        <button
                          type="button"
                          onClick={() => void unignoreTrx(t.id)}
                          className="text-xs text-[color:var(--brand-blue)] underline"
                          title="Doch matchen können"
                        >
                          zurück
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          offen
                        </span>
                        {t.amount < 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setManualTrx(t)}
                              className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] text-[color:var(--brand-blue)] hover:bg-[color:var(--surface)]"
                              title="Rechnung manuell zuordnen"
                            >
                              🔗 Matchen
                            </button>
                            <button
                              type="button"
                              onClick={() => void ignoreTrx(t)}
                              className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface)]"
                              title="Diese Buchung braucht keine Rechnung (z.B. Gehalt)"
                            >
                              kein Match
                            </button>
                          </>
                        )}
                      </div>
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

function StatusCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "amber" | "sky";
  hint: string;
}) {
  const colors: Record<string, string> = {
    emerald: "border-emerald-300 bg-emerald-50",
    amber: "border-amber-300 bg-amber-50",
    sky: "border-sky-300 bg-sky-50",
  };
  return (
    <div className={"rounded-lg border p-5 " + colors[tone]}>
      <div className="text-xs text-[color:var(--muted)]">{label}</div>
      <div className="text-3xl font-semibold text-[color:var(--foreground)] mt-2">
        {value}
      </div>
      <div className="text-xs text-[color:var(--muted)] mt-3">{hint}</div>
    </div>
  );
}
