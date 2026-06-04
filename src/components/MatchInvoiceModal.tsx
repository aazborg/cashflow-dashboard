"use client";
/**
 * Modal: zeigt offene Rechnungen, vorgefiltert nach dem Betrag der
 * Bank-Transaktion. User kann zusätzlich nach Lieferant/RG-Nr suchen.
 * Klick auf Treffer = sofortiger Match.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

type Txn = {
  id: string;
  booking_date: string;
  amount: number;
  waehrung: string;
  counterparty_name: string | null;
  purpose: string | null;
};

type Invoice = {
  id: string;
  lieferant_name: string | null;
  rechnung_nr: string | null;
  rechnungsdatum: string | null;
  brutto: number | null;
  netto: number | null;
  waehrung: string | null;
};

function eur(v: number | null | undefined, w = "EUR") {
  if (v == null) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: w || "EUR",
  }).format(Number(v));
}

function norm(s: string | null | undefined) {
  return (s ?? "").toLowerCase();
}

export default function MatchInvoiceModal({
  trx,
  onClose,
  onSuccess,
}: {
  trx: Txn;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const trxAbs = Math.abs(trx.amount);
  // Search default: der Betrag der Trx (häufigster Fall)
  const [search, setSearch] = useState(trxAbs.toFixed(2).replace(".", ","));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Lade alle offenen Rechnungen einmal beim Mount
  useEffect(() => {
    let abort = false;
    setLoading(true);
    setError(null);
    fetch("/cashflow/api/buchhaltung/invoices?status=offen&limit=1000", {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (abort) return;
        if (!j.ok) {
          setError(j.error ?? "Fehler");
          return;
        }
        setInvoices(j.invoices ?? []);
      })
      .catch((e) => !abort && setError(String(e)))
      .finally(() => !abort && setLoading(false));
    return () => {
      abort = true;
    };
  }, []);

  // Client-Filter: nach Betrag (numerisch, Toleranz 0,01) ODER
  // Text-Match in lieferant_name / rechnung_nr
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return invoices.slice(0, 100);
    const qNum = parseFloat(q.replace(/\./g, "").replace(",", "."));
    const qLow = q.toLowerCase();
    return invoices
      .filter((inv) => {
        const byAmount =
          Number.isFinite(qNum) &&
          inv.brutto != null &&
          Math.abs(Number(inv.brutto) - qNum) < 0.01;
        const byText =
          norm(inv.lieferant_name).includes(qLow) ||
          norm(inv.rechnung_nr).includes(qLow);
        return byAmount || byText;
      })
      .slice(0, 100);
  }, [invoices, search]);

  const link = useCallback(
    async (inv: Invoice) => {
      setBusyId(inv.id);
      setError(null);
      try {
        const res = await fetch("/cashflow/api/buchhaltung/match-manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: inv.id,
            transaction_id: trx.id,
          }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) {
          setError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        onSuccess();
        onClose();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusyId(null);
      }
    },
    [trx.id, onSuccess, onClose],
  );

  // ESC schliesst Modal
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-[color:var(--border)]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">Manuell matchen</h2>
              <div className="text-xs text-[color:var(--muted)] mt-0.5">
                Buchung {trx.booking_date} ·{" "}
                <strong className={trx.amount < 0 ? "text-red-700" : "text-emerald-700"}>
                  {eur(trx.amount, trx.waehrung)}
                </strong>{" "}
                · {trx.counterparty_name ?? "—"}
              </div>
              {trx.purpose && (
                <div className="text-xs text-[color:var(--muted)] mt-0.5 line-clamp-1">
                  {trx.purpose}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-2xl text-[color:var(--muted)] hover:text-[color:var(--foreground)] leading-none"
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Betrag, Lieferant, RG-Nr…"
            className="w-full px-3 py-2 rounded border border-[color:var(--border)] bg-white text-sm"
          />
          <div className="text-xs text-[color:var(--muted)] mt-1">
            {loading
              ? "Lade Rechnungen…"
              : `${filtered.length} von ${invoices.length} offenen Rechnungen`}
            {filtered.length === 100 && " (auf 100 begrenzt)"}
          </div>
        </div>

        {/* Result list */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-5 py-4 text-sm text-red-700 bg-red-50">{error}</div>
          )}
          {!error && !loading && filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-[color:var(--muted)]">
              Keine offene Rechnung passt zur Suche.
            </div>
          )}
          <ul className="divide-y divide-[color:var(--border)]">
            {filtered.map((inv) => {
              const amountMatch =
                inv.brutto != null &&
                Math.abs(Number(inv.brutto) - trxAbs) < 0.01;
              return (
                <li
                  key={inv.id}
                  className={
                    "px-5 py-3 hover:bg-[color:var(--surface)] " +
                    (amountMatch ? "bg-emerald-50/40" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {inv.lieferant_name ?? "—"}{" "}
                        {amountMatch && (
                          <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                            Betrag stimmt
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[color:var(--muted)] truncate">
                        RG-Nr: {inv.rechnung_nr ?? "—"} ·{" "}
                        {inv.rechnungsdatum ?? "ohne Datum"}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-sm font-semibold">
                        {eur(inv.brutto, inv.waehrung ?? "EUR")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void link(inv)}
                      disabled={busyId !== null}
                      className="text-xs px-3 py-1.5 rounded bg-[color:var(--foreground)] text-white disabled:opacity-50"
                    >
                      {busyId === inv.id ? "…" : "Diese zuordnen"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
