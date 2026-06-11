"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import MatchInvoiceModal from "./MatchInvoiceModal";
import MatchDealForTrxModal from "./MatchDealForTrxModal";

const API = "/cashflow/api/buchhaltung";

type MatchedInvoice = {
  id: string;
  drive_file_url: string | null;
  drive_filename: string | null;
  lieferant_name: string | null;
  rechnung_nr: string | null;
  rechnungsdatum: string | null;
  brutto: number | null;
};

type InvoiceMatch = {
  id: string;
  match_type: string;
  confidence: number | null;
  invoice: MatchedInvoice | null;
};

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
  accounting_invoice_matches?: InvoiceMatch[] | null;
};

type Overview = { bezahlt: number; offen: number; unbekannt: number };

// Lite-Form offener Rechnungen fürs Match-Modal (an MatchInvoiceModal-Prop)
type OpenInvoice = {
  id: string;
  lieferant_name: string | null;
  rechnung_nr: string | null;
  rechnungsdatum: string | null;
  brutto: number | null;
  netto: number | null;
  waehrung: string | null;
};

type Statement = {
  id: string;
  format: string;
  original_filename: string | null;
  zeitraum_von: string | null;
  zeitraum_bis: string | null;
  transaktionen_total: number;
  created_at: string;
  accounting_bank_accounts?: { bezeichnung: string; quelle: string } | null;
};

// "Geparkte" Status: fallen aus der Offen-Liste, bleiben aber über den
// jeweiligen Status-Filter auffindbar.
const PARKED_STATUS = new Set(["ignored", "privat", "nicht_zuordenbar"]);
// Anzeige-Label + Badge-Farbe pro geparktem Status.
const PARKED_LABEL: Record<string, { label: string; cls: string }> = {
  ignored: { label: "kein Match nötig", cls: "bg-gray-100 text-gray-500" },
  privat: { label: "privat", cls: "bg-violet-100 text-violet-700" },
  nicht_zuordenbar: {
    label: "nicht zuordenbar",
    cls: "bg-orange-100 text-orange-700",
  },
};

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
  // Default: offene Buchungen (das will Mario beim Arbeiten sehen)
  const [statusFilter, setStatusFilter] = useState("open");
  // Default: ignored ausblenden (sind oft Gehalt / Privat etc.)
  const [showIgnored, setShowIgnored] = useState(false);
  // "" | "in" | "out" -- Default: Beide. (Früher "out", aber sobald alle
  // Ausgänge gematcht sind, wäre "Offen+Ausgänge" leer und sähe kaputt
  // aus; mit "Beide" sieht man auch offene Eingänge/Kundenzahlungen.)
  const [directionFilter, setDirectionFilter] = useState<"" | "in" | "out">("");
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string | null>(null);
  const [manualTrx, setManualTrx] = useState<Txn | null>(null);
  const [manualTrxIn, setManualTrxIn] = useState<Txn | null>(null);
  // Progress: 0..100 fuer Upload, dann -1 = "Bot parst"
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStage, setUploadStage] = useState<string>("");
  // Filter
  const [quelleFilter, setQuelleFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  // 1-Feld-Suche: durchsucht counterparty + purpose + IBAN (clientseitig, instant)
  const [searchQuery, setSearchQuery] = useState<string>("");
  // Hochgeladene Auszuege
  const [statements, setStatements] = useState<Statement[]>([]);
  const [showStatements, setShowStatements] = useState(false);
  // Offene Rechnungen — EINMAL geladen, an MatchInvoiceModal durchgereicht,
  // damit das Modal beim Öffnen nicht jedes Mal über den Tunnel nachlädt.
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);

  // EINMAL alles laden -- KEINE Filter-Parameter, KEINE Filter-Deps.
  // Sämtliche Filterung (Status, Richtung, Quelle, Datum, Suche) passiert
  // clientseitig in `filteredTxns` (useMemo). So bleibt die Tabelle nach
  // dem ersten Laden im Speicher und reagiert ohne Netz-Roundtrip.
  // Refetch nur nach Mutationen (Upload / Match / Löschen / Ignorieren).
  const loadAll = useCallback(async () => {
    setLoading(true);
    // Defensiv: Vercel kann bei Function-Timeout HTML statt JSON liefern.
    const parseSafe = async (r: Response) => {
      const raw = await r.text();
      try {
        return JSON.parse(raw);
      } catch {
        return { ok: false, error: `HTTP ${r.status} (keine JSON-Antwort)` };
      }
    };
    try {
      // Bis zu 3 Versuche: das flakige Netz / ein Bot-Neustart kann den
      // Erstladen scheitern lassen -- ohne Retry bliebe die Tabelle dann
      // dauerhaft auf "0 von 0 Buchungen" stehen.
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const [ovRes, txRes, stRes, invRes] = await Promise.all([
            fetch(`${API}/match-overview`, { cache: "no-store" }),
            fetch(`${API}/transactions?limit=5000`, { cache: "no-store" }),
            fetch(`${API}/statements`, { cache: "no-store" }),
            fetch(`${API}/invoices?status=offen&limit=1000`, {
              cache: "no-store",
            }),
          ]);
          const ov = await parseSafe(ovRes);
          const tx = await parseSafe(txRes);
          const st = await parseSafe(stRes);
          const inv = await parseSafe(invRes);
          if (ov.ok)
            setOverview({
              bezahlt: ov.bezahlt,
              offen: ov.offen,
              unbekannt: ov.unbekannt,
            });
          if (st.ok) setStatements(st.statements ?? []);
          if (inv.ok) setOpenInvoices(inv.invoices ?? []);
          if (tx.ok) {
            setTxns(tx.transactions ?? []);
            return; // Buchungen geladen -> fertig
          }
        } catch {
          /* Netz-Fehler -> Retry */
        }
        if (attempt < 3)
          await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Clientseitige Filterung -- läuft im Speicher, kein Netz-Roundtrip.
  // Bildet die frühere Server-Filterlogik 1:1 nach:
  //   status   -> status === eq.{wert}; bei "Alle" ignored ausblenden
  //   direction-> in: amount>0, out: amount<0
  //   quelle   -> Konto-Quelle
  //   datum    -> booking_date zwischen from/to (ISO-Stringvergleich)
  //   suche    -> counterparty_name | purpose | counterparty_iban (instant)
  const filteredTxns = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return txns.filter((t) => {
      // Status: bei "Alle" (kein Filter) die geparkten Status
      // (ignored / privat / nicht_zuordenbar) ausblenden, ausser der
      // "geparkte anzeigen"-Toggle ist an.
      if (statusFilter) {
        if (t.status !== statusFilter) return false;
      } else if (!showIgnored && PARKED_STATUS.has(t.status)) {
        return false;
      }
      // Richtung
      if (directionFilter === "in" && !(t.amount > 0)) return false;
      if (directionFilter === "out" && !(t.amount < 0)) return false;
      // Quelle (Konto)
      if (quelleFilter && t.accounting_bank_accounts?.quelle !== quelleFilter)
        return false;
      // Datum (booking_date ist ISO yyyy-mm-dd -> Stringvergleich genügt)
      if (dateFrom && t.booking_date < dateFrom) return false;
      if (dateTo && t.booking_date > dateTo) return false;
      // Volltextsuche
      if (needle) {
        const hay = `${t.counterparty_name ?? ""} ${t.purpose ?? ""} ${
          t.counterparty_iban ?? ""
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [
    txns,
    statusFilter,
    showIgnored,
    directionFilter,
    quelleFilter,
    dateFrom,
    dateTo,
    searchQuery,
  ]);

  const deleteStatement = useCallback(
    async (s: Statement) => {
      const name = s.original_filename ?? "Auszug";
      if (
        !confirm(
          `"${name}" mit ${s.transaktionen_total} Buchungen löschen?\n\n` +
            `Auch alle Matches dieser Buchungen werden aufgehoben — ` +
            `verlinkte Rechnungen / Deals gehen zurück auf "offen".`,
        )
      )
        return;
      try {
        const res = await fetch(`${API}/statement/${s.id}`, {
          method: "DELETE",
        });
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

  // Einzel-Markierung "privat" / "nicht_zuordenbar" (ohne Auto-Lernen).
  // Fällt sofort aus "offen", bleibt über den Status-Filter auffindbar.
  const markTrx = useCallback(
    async (t: Txn, status: "privat" | "nicht_zuordenbar") => {
      try {
        const res = await fetch(
          `/cashflow/api/buchhaltung/transaction/${t.id}/ignore`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, remember: false }),
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
      // Beides parallel: Eingangsrechnungen (Ausgaenge) +
      // Ausgangsrechnungen (Eingaenge)
      const [resInv, resDeals] = await Promise.all([
        fetch(`${API}/match-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit_trx: 500 }),
        }),
        fetch(`${API}/match-deals-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit_trx: 500 }),
        }),
      ]);
      const jInv = await resInv.json();
      const jDeals = await resDeals.json();
      const parts: string[] = [];
      if (jInv.ok) {
        parts.push(
          `Eingangs-Rechnungen: ${jInv.matched_strong + jInv.matched_loose} gematched`,
        );
      }
      if (jDeals.ok) {
        parts.push(
          `Ausgangs-Rechnungen: ${jDeals.matched_strong + jDeals.matched_loose} gematched`,
        );
      }
      setMatchMsg(parts.length > 0 ? parts.join(" · ") : "kein Match");
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

      {/* Hochgeladene Auszuege (ausklappbar) */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg">
        <button
          type="button"
          onClick={() => setShowStatements(!showStatements)}
          className="w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-[color:var(--surface)] rounded-lg"
        >
          <span>
            <strong>{statements.length}</strong> hochgeladene Auszüge —{" "}
            <span className="text-[color:var(--muted)]">
              {showStatements ? "ausblenden" : "anzeigen / löschen"}
            </span>
          </span>
          <span className="text-[color:var(--muted)]">
            {showStatements ? "▲" : "▼"}
          </span>
        </button>
        {showStatements && (
          <div className="border-t border-[color:var(--border)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface)] text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Hochgeladen</th>
                  <th className="px-3 py-2 font-medium">Konto</th>
                  <th className="px-3 py-2 font-medium">Datei</th>
                  <th className="px-3 py-2 font-medium">Format</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Zeitraum</th>
                  <th className="px-3 py-2 font-medium text-right">Buchungen</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {statements.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-[color:var(--muted)]">
                      Noch nichts hochgeladen.
                    </td>
                  </tr>
                )}
                {statements.map((s) => (
                  <tr key={s.id} className="border-t border-[color:var(--border)]">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {s.created_at?.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.accounting_bank_accounts?.bezeichnung ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.original_filename ?? "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono">{s.format}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {s.zeitraum_von ?? "?"} – {s.zeitraum_bis ?? "?"}
                    </td>
                    <td className="px-3 py-2 text-xs text-right">{s.transaktionen_total}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void deleteStatement(s)}
                        className="text-xs px-2 py-1 rounded text-red-700 hover:bg-red-50"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
        <div className="text-xs text-[color:var(--muted)] space-y-1">
          <div>
            Erste Bank Business: <strong>CAMT.053 oder CSV</strong> aus George
            (JSON liefert keinen Verwendungszweck).
          </div>
          <div>
            Erste KK: PDF-Auszug. AmEx: CSV oder PDF. PayPal: CSV-Export
            (alle Transaktionen). GoCardless: JSON aus API-Export.
          </div>
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
          <label className="flex flex-col gap-1 flex-1 min-w-[14rem]">
            <span className="text-xs text-[color:var(--muted)]">Suche</span>
            <div className="relative">
              <input
                type="search"
                placeholder="Name, Verwendungszweck, IBAN…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1.5 pr-7 rounded border border-[color:var(--border)] bg-white text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-sm"
                  title="Suche löschen"
                >
                  ×
                </button>
              )}
            </div>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Richtung</span>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  { k: "", l: "Beide" },
                  { k: "in", l: "Eingänge" },
                  { k: "out", l: "Ausgänge" },
                ] as const
              ).map((f) => (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => setDirectionFilter(f.k)}
                  className={
                    "text-xs px-2 py-1 rounded border transition " +
                    (directionFilter === f.k
                      ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)] text-white"
                      : "border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
                  }
                >
                  {f.l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--muted)]">Status</span>
            <div className="flex gap-1 flex-wrap">
              {[
                { k: "", l: "Alle" },
                { k: "open", l: "Offen" },
                { k: "matched", l: "Gematched" },
                { k: "privat", l: "Privat" },
                { k: "nicht_zuordenbar", l: "Nicht zuordb." },
                { k: "ignored", l: "kein Match nötig" },
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
          <label className="flex items-center gap-2 text-xs text-[color:var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={showIgnored}
              onChange={(e) => setShowIgnored(e.target.checked)}
              className="rounded border-[color:var(--border)]"
            />
            <span>Geparkte (privat / nicht zuordb. / kein Match) anzeigen</span>
          </label>
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {loading
            ? "Lade…"
            : `${filteredTxns.length} von ${txns.length} Buchungen${
                dateFrom || dateTo
                  ? ` · ${dateFrom || "Anfang"} bis ${dateTo || "heute"}`
                  : ""
              }`}
        </div>
      </div>

      {/* Manuell-Match Modal — Ausgang -> Eingangsrechnung */}
      {manualTrx && (
        <MatchInvoiceModal
          trx={manualTrx}
          preloadedInvoices={openInvoices}
          onClose={() => setManualTrx(null)}
          onSuccess={() => {
            setManualTrx(null);
            void loadAll();
          }}
        />
      )}
      {/* Manuell-Match Modal — Eingang -> Deal */}
      {manualTrxIn && (
        <MatchDealForTrxModal
          trx={manualTrxIn}
          onClose={() => setManualTrxIn(null)}
          onSuccess={() => {
            setManualTrxIn(null);
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
              {!loading && txns.length > 0 && filteredTxns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Keine Buchungen für diese Filter.
                  </td>
                </tr>
              )}
              {filteredTxns.map((t) => (
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
                    {t.purpose ? (
                      <div className="line-clamp-2">{t.purpose}</div>
                    ) : (
                      <div className="text-[color:var(--muted)] italic">
                        {t.counterparty_iban ? (
                          <span className="font-mono">
                            IBAN: {t.counterparty_iban.slice(0, 16)}…
                          </span>
                        ) : (
                          "kein Verwendungszweck"
                        )}
                      </div>
                    )}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          ✓ gematched
                        </span>
                        {(t.accounting_invoice_matches ?? [])
                          .filter((m) => m.invoice?.drive_file_url)
                          .slice(0, 3)
                          .map((m) => (
                            <a
                              key={m.id}
                              href={m.invoice!.drive_file_url!}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] text-[color:var(--brand-blue)] underline"
                              title={[
                                m.invoice?.lieferant_name,
                                m.invoice?.rechnung_nr,
                                m.invoice?.rechnungsdatum,
                                m.invoice?.brutto != null
                                  ? eur(m.invoice.brutto, t.waehrung)
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            >
                              📄 Rechnung
                            </a>
                          ))}
                      </div>
                    ) : PARKED_STATUS.has(t.status) ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "text-xs px-2 py-0.5 rounded " +
                            (PARKED_LABEL[t.status]?.cls ??
                              "bg-gray-100 text-gray-500")
                          }
                        >
                          {PARKED_LABEL[t.status]?.label ?? t.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => void unignoreTrx(t.id)}
                          className="text-xs text-[color:var(--brand-blue)] underline"
                          title="Zurück auf offen"
                        >
                          zurück
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          offen
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            t.amount < 0
                              ? setManualTrx(t)
                              : setManualTrxIn(t)
                          }
                          className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] text-[color:var(--brand-blue)] hover:bg-[color:var(--surface)]"
                          title={
                            t.amount < 0
                              ? "Eingangsrechnung manuell zuordnen"
                              : "Ausgangs-Rechnung (Deal) manuell zuordnen"
                          }
                        >
                          🔗 Matchen
                        </button>
                        <button
                          type="button"
                          onClick={() => void markTrx(t, "privat")}
                          className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] text-violet-700 hover:bg-violet-50"
                          title="Private Ausgabe – aus Offen entfernen, unter 'Privat' auffindbar"
                        >
                          privat
                        </button>
                        <button
                          type="button"
                          onClick={() => void markTrx(t, "nicht_zuordenbar")}
                          className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] text-orange-700 hover:bg-orange-50"
                          title="Nicht zuordenbar – aus Offen entfernen, unter 'Nicht zuordb.' auffindbar"
                        >
                          nicht zuordb.
                        </button>
                        <button
                          type="button"
                          onClick={() => void ignoreTrx(t)}
                          className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface)]"
                          title="Braucht keine Rechnung (z.B. Gehalt). Der Bot merkt sich das Muster."
                        >
                          kein Match
                        </button>
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
