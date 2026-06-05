"use client";
/**
 * Modal: bei einem Deal (Ausgangsrechnung) die passende EINGANGS-Bank-
 * Buchung suchen + zuordnen. Standardsuche = Brutto-Betrag des Deals,
 * Mario kann nach Name oder anderem Betrag suchen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deal } from "@/lib/types";

type Txn = {
  id: string;
  booking_date: string;
  amount: number;
  waehrung: string;
  counterparty_name: string | null;
  purpose: string | null;
  status: string;
  accounting_bank_accounts?: { bezeichnung: string } | null;
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

export default function DealMatchBankModal({
  deal,
  onClose,
  onSuccess,
}: {
  deal: Deal;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const dealBetrag = Number(deal.betrag_original ?? deal.betrag ?? 0);
  const restBetrag = Math.max(
    0,
    dealBetrag - Number(deal.amount_paid ?? 0),
  );
  const defaultSearch =
    restBetrag > 0
      ? restBetrag.toFixed(2).replace(".", ",")
      : `${deal.vorname} ${deal.nachname}`.trim();
  const [search, setSearch] = useState(defaultSearch);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setError(null);
    fetch(
      "/cashflow/api/buchhaltung/transactions?status=open&limit=2000",
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((j) => {
        if (abort) return;
        if (!j.ok) {
          setError(j.error ?? "Fehler");
          return;
        }
        // Nur Eingangs-Buchungen (positive amount)
        setTxns((j.transactions ?? []).filter((t: Txn) => t.amount > 0));
      })
      .catch((e) => !abort && setError(String(e)))
      .finally(() => !abort && setLoading(false));
    return () => {
      abort = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return txns.slice(0, 100);
    const qNum = parseFloat(q.replace(/\./g, "").replace(",", "."));
    const qLow = q.toLowerCase();
    return txns
      .filter((t) => {
        const byAmount =
          Number.isFinite(qNum) && Math.abs(t.amount - qNum) < 0.01;
        const byText =
          norm(t.counterparty_name).includes(qLow) ||
          norm(t.purpose).includes(qLow);
        return byAmount || byText;
      })
      .slice(0, 100);
  }, [txns, search]);

  const link = useCallback(
    async (trx: Txn) => {
      setBusyId(trx.id);
      setError(null);
      try {
        const res = await fetch(
          `/cashflow/api/buchhaltung/deal/${deal.id}/match`,
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
    [deal.id, onSuccess, onClose],
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
              <h2 className="text-lg font-semibold">Bezahlung zuordnen</h2>
              <div className="text-xs text-[color:var(--muted)] mt-0.5">
                {deal.vorname} {deal.nachname} ·{" "}
                <strong>{eur(dealBetrag)}</strong>
                {deal.amount_paid != null && Number(deal.amount_paid) > 0 && (
                  <span>
                    {" "}
                    · bereits zugeordnet {eur(Number(deal.amount_paid))} ·
                    offen <strong>{eur(restBetrag)}</strong>
                  </span>
                )}
              </div>
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
            placeholder="Betrag, Gegenpartei, Verwendungszweck…"
            className="w-full px-3 py-2 rounded border border-[color:var(--border)] bg-white text-sm"
          />
          <div className="text-xs text-[color:var(--muted)] mt-1">
            {loading
              ? "Lade Buchungen…"
              : `${filtered.length} von ${txns.length} offenen Eingangs-Buchungen`}
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
              Keine offene Buchung passt zur Suche.
            </div>
          )}
          <ul className="divide-y divide-[color:var(--border)]">
            {filtered.map((t) => {
              const amountMatch =
                restBetrag > 0 && Math.abs(t.amount - restBetrag) < 0.01;
              return (
                <li
                  key={t.id}
                  className={
                    "px-5 py-3 hover:bg-[color:var(--surface)] " +
                    (amountMatch ? "bg-emerald-50/40" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {t.counterparty_name ?? "—"}{" "}
                        {amountMatch && (
                          <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                            Betrag stimmt
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[color:var(--muted)] truncate">
                        {t.booking_date}
                        {t.accounting_bank_accounts?.bezeichnung && (
                          <span>
                            {" "}
                            · {t.accounting_bank_accounts.bezeichnung}
                          </span>
                        )}
                      </div>
                      {t.purpose && (
                        <div className="text-xs text-[color:var(--muted)] line-clamp-1 mt-0.5">
                          {t.purpose}
                        </div>
                      )}
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-sm font-semibold text-emerald-700">
                        {eur(t.amount, t.waehrung)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void link(t)}
                      disabled={busyId !== null}
                      className="text-xs px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white font-medium disabled:opacity-50"
                    >
                      {busyId === t.id ? "…" : "Diese zuordnen"}
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
