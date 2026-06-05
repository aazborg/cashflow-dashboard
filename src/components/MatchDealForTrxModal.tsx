"use client";
/**
 * Modal: bei einer EINGANGS-Bank-Buchung den passenden Deal
 * (Ausgangsrechnung) suchen + zuordnen. Standardsuche = Betrag der Trx.
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

type Deal = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  betrag: number;
  betrag_original?: number | null;
  start_datum: string | null;
  anzahl_raten: number | null;
  intervall: string | null;
  payment_status?: string | null;
  amount_paid?: number | null;
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

export default function MatchDealForTrxModal({
  trx,
  onClose,
  onSuccess,
}: {
  trx: Txn;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const trxAmt = trx.amount;
  const [search, setSearch] = useState(
    trxAmt > 0 ? trxAmt.toFixed(2).replace(".", ",") : "",
  );
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setError(null);
    fetch("/cashflow/api/deals?payment_status=open&limit=2000", {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (abort) return;
        if (j.error) {
          setError(j.error);
          return;
        }
        setDeals(j.deals ?? []);
      })
      .catch((e) => !abort && setError(String(e)))
      .finally(() => !abort && setLoading(false));
    return () => {
      abort = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return deals.slice(0, 100);
    const qNum = parseFloat(q.replace(/\./g, "").replace(",", "."));
    const qLow = q.toLowerCase();
    return deals
      .filter((d) => {
        const dealBetrag = Number(d.betrag_original ?? d.betrag ?? 0);
        const rate =
          d.anzahl_raten && d.anzahl_raten > 1
            ? dealBetrag / d.anzahl_raten
            : null;
        const byAmount =
          Number.isFinite(qNum) &&
          (Math.abs(dealBetrag - qNum) < 0.01 ||
            (rate != null && Math.abs(rate - qNum) < 0.01));
        const byText =
          norm(d.vorname).includes(qLow) ||
          norm(d.nachname).includes(qLow) ||
          norm(d.email).includes(qLow);
        return byAmount || byText;
      })
      .slice(0, 100);
  }, [deals, search]);

  const link = useCallback(
    async (d: Deal) => {
      setBusyId(d.id);
      setError(null);
      try {
        const res = await fetch(
          `/cashflow/api/buchhaltung/deal/${d.id}/match`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transaction_id: trx.id }),
          },
        );
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
        <div className="px-5 py-3 border-b border-[color:var(--border)]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">Rechnung zuordnen</h2>
              <div className="text-xs text-[color:var(--muted)] mt-0.5">
                Eingang {trx.booking_date} ·{" "}
                <strong className="text-emerald-700">
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

        <div className="px-5 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Betrag, Vorname, Nachname, E-Mail…"
            className="w-full px-3 py-2 rounded border border-[color:var(--border)] bg-white text-sm"
          />
          <div className="text-xs text-[color:var(--muted)] mt-1">
            {loading
              ? "Lade offene Rechnungen…"
              : `${filtered.length} von ${deals.length} offenen Rechnungen`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-5 py-4 text-sm text-red-700 bg-red-50">
              {error}
            </div>
          )}
          {!error && !loading && filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-[color:var(--muted)]">
              Keine offene Rechnung passt zur Suche.
            </div>
          )}
          <ul className="divide-y divide-[color:var(--border)]">
            {filtered.map((d) => {
              const dealBetrag = Number(d.betrag_original ?? d.betrag ?? 0);
              const rate =
                d.anzahl_raten && d.anzahl_raten > 1
                  ? dealBetrag / d.anzahl_raten
                  : null;
              const amountMatch =
                Math.abs(dealBetrag - trxAmt) < 0.01 ||
                (rate != null && Math.abs(rate - trxAmt) < 0.01);
              return (
                <li
                  key={d.id}
                  className={
                    "px-5 py-3 hover:bg-[color:var(--surface)] " +
                    (amountMatch ? "bg-emerald-50/40" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {d.vorname} {d.nachname}{" "}
                        {amountMatch && (
                          <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                            Betrag stimmt
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[color:var(--muted)] truncate">
                        {d.email ?? "ohne E-Mail"}
                        {d.start_datum && <span> · ab {d.start_datum}</span>}
                        {d.anzahl_raten && d.anzahl_raten > 1 && (
                          <span> · {d.anzahl_raten} Raten</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-sm font-semibold">
                        {eur(dealBetrag)}
                      </div>
                      {rate != null && (
                        <div className="text-xs text-[color:var(--muted)]">
                          Rate: {eur(rate)}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void link(d)}
                      disabled={busyId !== null}
                      className="text-xs px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white font-medium disabled:opacity-50"
                    >
                      {busyId === d.id ? "…" : "Diese zuordnen"}
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
