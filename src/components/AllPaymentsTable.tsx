/**
 * Tabelle aller GoCardless-Payments (Kunden-uebergreifend) fuer den
 * 'Alle Zahlungen'-Tab in /zahlungen.
 *
 * Fetcht /api/bot/gocardless/all-payments im open-state.
 * - Default-Sortierung: charge_date DESC (neueste zuerst)
 * - Filter: Suche (Name/Email/Beschreibung), Status, Datumsbereich
 */
"use client";

import { useEffect, useMemo, useState } from "react";

interface ApiPayment {
  id: string;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  charge_date: string | null;
  description: string | null;
  reference: string | null;
  created_at: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  mitarbeiter: string | null;
  deal_id: string | null;
  mandate_id: string | null;
  subscription_id: string | null;
  instalment_schedule_id: string | null;
}

type StatusFilter =
  | "all"
  | "confirmed"
  | "pending"
  | "failed"
  | "cancelled"
  | "chargeback"
  | "scheduled";

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "name_asc";

interface Props {
  /** Optionaler Vorfilter -- z.B. fuer den 'Rueckbelastungen'-Tab.
   *  Wenn gesetzt, wird der Status-Dropdown ausgeblendet. */
  defaultStatus?: StatusFilter;
  emptyMessage?: string;
}

const eur = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("de-AT", {
    style: "currency",
    currency: "EUR",
  });

const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("de-AT") : "—";

function statusGroup(status: string | null): "confirmed" | "pending" | "failed" | "cancelled" | "chargeback" | "scheduled" | "other" {
  const s = status ?? "";
  if (s === "confirmed" || s === "paid_out") return "confirmed";
  if (
    s === "pending_submission" ||
    s === "submitted" ||
    s === "pending_customer_approval"
  )
    return "pending";
  if (s === "charged_back") return "chargeback";
  if (s === "cancelled" || s === "customer_approval_denied") return "cancelled";
  if (s === "failed") return "failed";
  if (s === "scheduled") return "scheduled";
  return "other";
}

function statusBadge(status: string | null): { cls: string; label: string } {
  const g = statusGroup(status);
  if (g === "confirmed") {
    return {
      cls: "bg-green-100 text-green-900 border-green-300",
      label: "✓ " + (status ?? ""),
    };
  }
  if (g === "pending") {
    return {
      cls: "bg-amber-100 text-amber-900 border-amber-300",
      label: "⏳ " + (status ?? ""),
    };
  }
  if (g === "failed") {
    return {
      cls: "bg-red-100 text-red-900 border-red-300",
      label: "✗ " + (status ?? ""),
    };
  }
  if (g === "cancelled") {
    return {
      cls: "bg-slate-200 text-slate-700 border-slate-300",
      label: "⊘ " + (status ?? ""),
    };
  }
  if (g === "chargeback") {
    return {
      cls: "bg-orange-100 text-orange-900 border-orange-300",
      label: "↩ " + (status ?? ""),
    };
  }
  return {
    cls: "bg-gray-100 text-gray-700 border-gray-300",
    label: status ?? "—",
  };
}

export default function AllPaymentsTable({
  defaultStatus = "all",
  emptyMessage = "Keine Zahlungen passen zu den Filtern.",
}: Props = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [env, setEnv] = useState<string>("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(defaultStatus);
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const hideStatusFilter = defaultStatus !== "all";

  useEffect(() => {
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(
          "/cashflow/api/payments",
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const j = (await res.json()) as {
          env: string;
          count: number;
          payments: ApiPayment[];
        };
        setPayments(j.payments);
        setEnv(j.env);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = payments.filter((p) => {
      if (q) {
        const hay = `${p.customer_name} ${p.customer_email ?? ""} ${p.description ?? ""} ${p.reference ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all") {
        if (statusGroup(p.status) !== statusFilter) return false;
      }
      if (dateFrom && (p.charge_date ?? "") < dateFrom) return false;
      if (dateTo && (p.charge_date ?? "") > dateTo) return false;
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      switch (sort) {
        case "date_asc": {
          const da = a.charge_date ?? "9999-99-99";
          const db = b.charge_date ?? "9999-99-99";
          return da.localeCompare(db);
        }
        case "amount_desc":
          return (b.amount_cents ?? 0) - (a.amount_cents ?? 0);
        case "name_asc":
          return a.customer_name.localeCompare(b.customer_name, "de");
        case "date_desc":
        default: {
          const da = a.charge_date ?? "0000-00-00";
          const db = b.charge_date ?? "0000-00-00";
          return db.localeCompare(da);
        }
      }
    });
    return rows;
  }, [payments, search, statusFilter, sort, dateFrom, dateTo]);

  const totals = useMemo(() => {
    let total = 0,
      paid = 0,
      pending = 0,
      failed = 0;
    for (const p of filtered) {
      const amt = p.amount_cents ?? 0;
      total += amt;
      const g = statusGroup(p.status);
      if (g === "confirmed") paid += amt;
      else if (g === "pending") pending += amt;
      else if (g === "failed") failed += amt;
    }
    return { total, paid, pending, failed };
  }, [filtered]);

  const isSandbox = env === "sandbox";

  return (
    <div className="space-y-3">
      {/* Filterleiste */}
      <div className="flex flex-wrap gap-2 items-end bg-white rounded-lg border border-[color:var(--border)] p-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Suche
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Email, Beschreibung, Referenz…"
            className="w-full border border-[color:var(--border)] rounded px-3 py-1.5 text-sm"
          />
        </div>
        {hideStatusFilter ? null : (
          <div>
            <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
            >
              <option value="all">Alle</option>
              <option value="confirmed">Bestätigt</option>
              <option value="pending">In Bearbeitung</option>
              <option value="failed">Fehlgeschlagen</option>
              <option value="cancelled">Storniert</option>
              <option value="chargeback">Rückbelastet</option>
              <option value="scheduled">Geplant</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Von
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Bis
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Sortieren
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          >
            <option value="date_desc">Datum (neueste)</option>
            <option value="date_asc">Datum (älteste)</option>
            <option value="amount_desc">Betrag (höchst)</option>
            <option value="name_asc">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Summen */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        <div className="bg-white rounded border border-[color:var(--border)] p-2">
          <div className="text-[10px] uppercase text-[color:var(--muted)]">
            Einträge
          </div>
          <div className="font-semibold tabular-nums">{filtered.length}</div>
        </div>
        <div className="bg-blue-50 rounded border border-blue-300 p-2">
          <div className="text-[10px] uppercase text-blue-900/70">Total</div>
          <div className="font-semibold tabular-nums text-blue-900">
            {eur(totals.total)}
          </div>
        </div>
        <div className="bg-green-50 rounded border border-green-300 p-2">
          <div className="text-[10px] uppercase text-green-900/70">
            Bestätigt
          </div>
          <div className="font-semibold tabular-nums text-green-900">
            {eur(totals.paid)}
          </div>
        </div>
        <div className="bg-amber-50 rounded border border-amber-300 p-2">
          <div className="text-[10px] uppercase text-amber-900/70">
            In Bearb.
          </div>
          <div className="font-semibold tabular-nums text-amber-900">
            {eur(totals.pending)}
          </div>
        </div>
        <div className="bg-red-50 rounded border border-red-300 p-2">
          <div className="text-[10px] uppercase text-red-900/70">
            Fehlgeschl.
          </div>
          <div className="font-semibold tabular-nums text-red-900">
            {eur(totals.failed)}
          </div>
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] overflow-x-auto">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-[color:var(--muted)]">
            Lade Zahlungen aus GoCardless …
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-red-700">Fehler: {error}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-xs uppercase">
              <tr className="text-left">
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Mitarbeiter</th>
                <th className="px-3 py-2 text-right">Betrag</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Beschreibung</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-[color:var(--muted)]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const stat = statusBadge(p.status);
                  const gcUrl = isSandbox
                    ? `https://manage-sandbox.gocardless.com/payments/${p.id}`
                    : `https://manage.gocardless.com/payments/${p.id}`;
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]/30"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(p.charge_date)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.customer_name}</div>
                        {p.customer_email ? (
                          <div className="text-[10px] text-[color:var(--muted)]">
                            {p.customer_email}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                        {p.mitarbeiter || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {eur(p.amount_cents)}
                      </td>
                      <td className="px-3 py-2">
                        <a
                          href={gcUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border hover:opacity-80 " +
                            stat.cls
                          }
                          title="In GoCardless öffnen"
                        >
                          {stat.label}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)] max-w-[280px] truncate"
                        title={p.description ?? ""}>
                        {p.description || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
