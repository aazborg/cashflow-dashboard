/**
 * Tabelle fuer /zahlungen — Buchhaltungs-Uebersicht.
 *
 * Spalten:
 *  - Name + Email
 *  - Mitarbeiter
 *  - Modell (Einmal/Raten/-)
 *  - Gesamt   (Vertrag oder deal.betrag)
 *  - Bezahlt  (GC-paid count + Summe)
 *  - Offen    (Gesamt - Bezahlt)
 *  - Naechste (Datum + Betrag)
 *  - Status   (GC-Mandate)
 *
 * Filter: Suche (Name/Email), Modell, GC-Status.
 * Sortierung: Name A-Z (default), Naechste, Offen, Gesamt.
 */
"use client";

import { useMemo, useState } from "react";
import type { Deal, Employee } from "@/lib/types";
import PaymentDetailModal from "@/components/PaymentDetailModal";

type SortKey = "name" | "next_date" | "offen" | "gesamt" | "bezahlt";
type ModellFilter = "all" | "einmal" | "raten" | "unbekannt";
type StatusFilter =
  | "all"
  | "active"
  | "pending"
  | "failed"
  | "no_mandate";

interface Props {
  deals: Deal[];
  employees: Employee[];
  isAdmin: boolean;
  canManageDunning?: boolean;
  /** Wird gerufen wenn der Mahn-Workflow im Modal Status veraendert
   *  -- Parent (ZahlungenTabs) patcht die Deal-Override-Map damit
   *  der Deal sofort im Inkasso-Tab erscheint. */
  onDealUpdate?: (
    dealId: string,
    patch: {
      dunning_status?:
        | "mahnung_1"
        | "mahnung_2"
        | "inkasso"
        | "resolved"
        | null;
    },
  ) => void;
}

const eur = (n: number) =>
  n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("de-AT") : "—";

function gesamtBetrag(d: Deal): number {
  // Prio: Vertrag-Gesamtbetrag > betrag_original > betrag
  return Number(d.vertrag_gesamtbetrag
    ?? d.betrag_original
    ?? d.betrag
    ?? 0);
}

function bezahlt(d: Deal): number {
  return (d.gocardless_paid_amount_cents ?? 0) / 100;
}

function offen(d: Deal): number {
  const total = gesamtBetrag(d);
  const paid = bezahlt(d);
  return Math.max(0, total - paid);
}

function modellLabel(d: Deal): "Einmal" | "Raten" | "—" {
  if (d.zahlungsmodell === "einmal") return "Einmal";
  if (d.zahlungsmodell === "raten") return "Raten";
  return "—";
}

function statusBadge(d: Deal): {
  text: string;
  cls: string;
  tip: string;
} {
  const ms = d.gocardless_mandate_status;
  const failed = !!d.gocardless_last_failure_at;
  const env = d.gocardless_env;
  const sbx = env === "sandbox" ? " (SBX)" : "";
  if (!ms) {
    if (d.zahlungsmodell === "raten") {
      return {
        text: "kein Mandat",
        cls: "bg-gray-100 text-gray-700 border-gray-300",
        tip: "Ratenzahlung laut Vertrag, aber kein GC-Mandat angelegt.",
      };
    }
    return {
      text: "—",
      cls: "bg-gray-50 text-gray-500 border-gray-200",
      tip: "Keine GC-Daten",
    };
  }
  if (ms === "active") {
    if (failed) {
      return {
        text: `Aktiv⚠${sbx}`,
        cls: "bg-red-100 text-red-900 border-red-400",
        tip: `Mandat aktiv, ABER letzte Lastschrift fehlgeschlagen: ${d.gocardless_last_failure_reason ?? "—"}`,
      };
    }
    return {
      text: `Aktiv✓${sbx}`,
      cls: "bg-green-100 text-green-900 border-green-400",
      tip: "Mandat aktiv, läuft regulär.",
    };
  }
  if (
    ms === "pending_submission" ||
    ms === "submitted" ||
    ms === "pending_customer_approval"
  ) {
    return {
      text: `Pending${sbx}`,
      cls: "bg-amber-100 text-amber-900 border-amber-400",
      tip: `Mandat angelegt, wartet auf Bank-Bestätigung (${ms}).`,
    };
  }
  return {
    text: `${ms}${sbx}`,
    cls: "bg-red-100 text-red-900 border-red-400",
    tip: `Mandat-Status: ${ms}`,
  };
}

export default function ZahlungenTable({
  deals,
  employees,
  isAdmin,
  canManageDunning,
  onDealUpdate,
}: Props) {
  void employees;
  const canDunning = canManageDunning ?? isAdmin;

  const [search, setSearch] = useState("");
  const [modell, setModell] = useState<ModellFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [detailDeal, setDetailDeal] = useState<Deal | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = deals.filter((d) => {
      if (q) {
        const name = `${d.vorname ?? ""} ${d.nachname ?? ""}`.toLowerCase();
        const email = (d.email ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      if (modell !== "all") {
        if (modell === "unbekannt" && d.zahlungsmodell) return false;
        if (modell !== "unbekannt" && d.zahlungsmodell !== modell)
          return false;
      }
      if (status !== "all") {
        const ms = d.gocardless_mandate_status;
        const failed = !!d.gocardless_last_failure_at;
        if (status === "no_mandate" && ms) return false;
        if (status === "active" && (ms !== "active" || failed)) return false;
        if (
          status === "pending" &&
          ms !== "pending_submission" &&
          ms !== "submitted" &&
          ms !== "pending_customer_approval"
        ) {
          return false;
        }
        if (
          status === "failed" &&
          !(
            failed ||
            ms === "failed" ||
            ms === "cancelled" ||
            ms === "expired" ||
            ms === "blocked"
          )
        ) {
          return false;
        }
      }
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      switch (sort) {
        case "next_date": {
          const da = a.gocardless_next_payment_date ?? "9999-99-99";
          const db = b.gocardless_next_payment_date ?? "9999-99-99";
          return da.localeCompare(db);
        }
        case "offen":
          return offen(b) - offen(a);
        case "gesamt":
          return gesamtBetrag(b) - gesamtBetrag(a);
        case "bezahlt":
          return bezahlt(b) - bezahlt(a);
        case "name":
        default: {
          const an = `${a.nachname ?? ""} ${a.vorname ?? ""}`.toLowerCase();
          const bn = `${b.nachname ?? ""} ${b.vorname ?? ""}`.toLowerCase();
          return an.localeCompare(bn, "de");
        }
      }
    });
    return rows;
  }, [deals, search, modell, status, sort]);

  const totals = useMemo(() => {
    let g = 0,
      bz = 0,
      of = 0;
    for (const d of filtered) {
      g += gesamtBetrag(d);
      bz += bezahlt(d);
      of += offen(d);
    }
    return { g, bz, of };
  }, [filtered]);

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
            placeholder="Name oder Email…"
            className="w-full border border-[color:var(--border)] rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Modell
          </label>
          <select
            value={modell}
            onChange={(e) => setModell(e.target.value as ModellFilter)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          >
            <option value="all">Alle</option>
            <option value="einmal">Einmal</option>
            <option value="raten">Raten</option>
            <option value="unbekannt">Unbekannt</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            GC-Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          >
            <option value="all">Alle</option>
            <option value="active">Aktiv</option>
            <option value="pending">Pending</option>
            <option value="failed">Fehler/Cancelled</option>
            <option value="no_mandate">Kein Mandat</option>
          </select>
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
            <option value="name">Name (A–Z)</option>
            <option value="next_date">Nächste Zahlung</option>
            <option value="offen">Offen (höchst)</option>
            <option value="gesamt">Gesamt (höchst)</option>
            <option value="bezahlt">Bezahlt (höchst)</option>
          </select>
        </div>
      </div>

      {/* Summen-Zeile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="bg-white rounded border border-[color:var(--border)] p-2">
          <div className="text-[10px] uppercase text-[color:var(--muted)]">
            Einträge
          </div>
          <div className="font-semibold tabular-nums">{filtered.length}</div>
        </div>
        <div className="bg-blue-50 rounded border border-blue-300 p-2">
          <div className="text-[10px] uppercase text-blue-900/70">Gesamt</div>
          <div className="font-semibold tabular-nums text-blue-900">
            {eur(totals.g)}
          </div>
        </div>
        <div className="bg-green-50 rounded border border-green-300 p-2">
          <div className="text-[10px] uppercase text-green-900/70">
            Bezahlt
          </div>
          <div className="font-semibold tabular-nums text-green-900">
            {eur(totals.bz)}
          </div>
        </div>
        <div className="bg-amber-50 rounded border border-amber-300 p-2">
          <div className="text-[10px] uppercase text-amber-900/70">Offen</div>
          <div className="font-semibold tabular-nums text-amber-900">
            {eur(totals.of)}
          </div>
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)] text-xs uppercase">
            <tr className="text-left">
              <th className="px-3 py-2">Kunde</th>
              <th className="px-3 py-2">Mitarbeiter</th>
              <th className="px-3 py-2">Modell</th>
              <th className="px-3 py-2 text-right">Gesamt</th>
              <th className="px-3 py-2 text-right">Bezahlt</th>
              <th className="px-3 py-2 text-right">Offen</th>
              <th className="px-3 py-2">Nächste</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const stat = statusBadge(d);
              const total = gesamtBetrag(d);
              const paid = bezahlt(d);
              const open = offen(d);
              const env = d.gocardless_env;
              const mandateId = d.gocardless_mandate_id;
              const gcUrl =
                mandateId
                  ? `https://manage${env === "sandbox" ? "-sandbox" : ""}.gocardless.com/mandates/${mandateId}`
                  : null;
              return (
                <tr
                  key={d.id}
                  onClick={(e) => {
                    // Klick auf <a>-Status-Badge nicht zum Modal hochreichen
                    if ((e.target as HTMLElement).closest("a")) return;
                    setDetailDeal(d);
                  }}
                  className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]/50 cursor-pointer"
                  title="Klicken für Detail-Ansicht (alle Zahlungen)"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {d.nachname} {d.vorname ? `, ${d.vorname}` : ""}
                    </div>
                    {d.email && (
                      <div className="text-xs text-[color:var(--muted)]">
                        {d.email}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                    {d.mitarbeiter_name || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border " +
                        (d.zahlungsmodell === "raten"
                          ? "bg-amber-100 text-amber-900 border-amber-300"
                          : d.zahlungsmodell === "einmal"
                          ? "bg-blue-100 text-blue-900 border-blue-300"
                          : "bg-gray-100 text-gray-600 border-gray-300")
                      }
                    >
                      {modellLabel(d)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {total > 0 ? eur(total) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {paid > 0 ? (
                      <>
                        {eur(paid)}
                        {d.gocardless_paid_count ? (
                          <div className="text-[10px] text-[color:var(--muted)]">
                            {d.gocardless_paid_count}× eingezogen
                          </div>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className={
                      "px-3 py-2 text-right tabular-nums " +
                      (open > 0 ? "text-amber-900 font-semibold" : "")
                    }
                  >
                    {open > 0 ? eur(open) : eur(0)}
                  </td>
                  <td className="px-3 py-2">
                    {d.gocardless_next_payment_date ? (
                      <div>
                        <div>{formatDate(d.gocardless_next_payment_date)}</div>
                        {d.gocardless_next_payment_amount_cents ? (
                          <div className="text-[10px] text-[color:var(--muted)] tabular-nums">
                            {eur(
                              (d.gocardless_next_payment_amount_cents ?? 0) /
                                100,
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[color:var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {gcUrl ? (
                      <a
                        href={gcUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border hover:opacity-80 " +
                          stat.cls
                        }
                        title={stat.tip}
                      >
                        {stat.text}
                      </a>
                    ) : (
                      <span
                        className={
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border " +
                          stat.cls
                        }
                        title={stat.tip}
                      >
                        {stat.text}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-[color:var(--muted)]"
                >
                  Keine Einträge passen zu den Filtern.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detailDeal ? (
        <PaymentDetailModal
          deal={detailDeal}
          onClose={() => setDetailDeal(null)}
          canManageDunning={canDunning}
          onDealChanged={(id, patch) =>
            onDealUpdate?.(id, {
              dunning_status: patch.dunning_status as
                | "mahnung_1"
                | "mahnung_2"
                | "inkasso"
                | "resolved"
                | null,
            })
          }
        />
      ) : null}
    </div>
  );
}
