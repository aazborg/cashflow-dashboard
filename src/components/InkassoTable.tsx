/**
 * Tabelle aller Deals mit aktivem Mahnungs-/Inkasso-Status.
 *
 * Filterbar nach Stufe (Mahnung 1 / 2 / Inkasso / Resolved).
 * Sortiert nach inkasso_due_at ASC (ueberfaellige zuerst), dann
 * dunning_updated_at DESC.
 */
"use client";

import { useMemo, useState } from "react";
import type { Deal } from "@/lib/types";
import PaymentDetailModal from "@/components/PaymentDetailModal";

type StatusFilter =
  | "all"
  | "mahnung_1"
  | "mahnung_2"
  | "inkasso"
  | "resolved";

type StageFilter =
  | "all"
  | "none"
  | "ergo"
  | "anwalt"
  | "gericht"
  | "gewonnen"
  | "verloren";

const STAGE_LABELS: Record<string, string> = {
  ergo: "Bei Ergo",
  anwalt: "Bei Anwalt",
  gericht: "Vor Gericht",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const STAGE_CLS: Record<string, string> = {
  ergo: "bg-orange-100 text-orange-900 border-orange-400",
  anwalt: "bg-purple-100 text-purple-900 border-purple-400",
  gericht: "bg-red-200 text-red-900 border-red-500",
  gewonnen: "bg-green-100 text-green-900 border-green-500",
  verloren: "bg-gray-300 text-gray-900 border-gray-500",
};

interface Props {
  deals: Deal[];
  isAdmin?: boolean;
  /** Stage-Select + Dunning-Buttons (admin/accounting). */
  canManageDunning?: boolean;
}

const eur = (n: number) =>
  n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("de-AT") : "—";

const formatDateTime = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("de-AT", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function statusBadge(status: string | null | undefined): {
  cls: string;
  label: string;
} {
  if (status === "mahnung_1") {
    return {
      cls: "bg-amber-100 text-amber-900 border-amber-400",
      label: "1. Mahnung",
    };
  }
  if (status === "mahnung_2") {
    return {
      cls: "bg-red-100 text-red-900 border-red-400",
      label: "2. Mahnung",
    };
  }
  if (status === "inkasso") {
    return {
      cls: "bg-red-600 text-white border-red-700",
      label: "Inkasso",
    };
  }
  if (status === "resolved") {
    return {
      cls: "bg-green-100 text-green-900 border-green-400",
      label: "✓ Erledigt",
    };
  }
  return {
    cls: "bg-gray-100 text-gray-700 border-gray-300",
    label: status ?? "—",
  };
}

export default function InkassoTable({
  deals: initialDeals,
  isAdmin = false,
  canManageDunning = false,
}: Props) {
  // Fallback fuer alte Aufrufe ohne explizites canManageDunning:
  // admin impliziert canManageDunning
  const canEdit = canManageDunning || isAdmin;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [search, setSearch] = useState("");
  const [hideResolved, setHideResolved] = useState(true);
  const [detailDeal, setDetailDeal] = useState<Deal | null>(null);

  // Lokale Kopie damit Stage-Updates ohne Page-Reload sichtbar werden
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function updateStage(deal: Deal, stage: string | null) {
    setSavingId(deal.id);
    try {
      const res = await fetch(
        "/cashflow/api/bot/dunning/inkasso-stage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_id: deal.id, stage }),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Fehler: ${j.error || res.status}`);
        return;
      }
      setDeals((ds) =>
        ds.map((d) =>
          d.id === deal.id
            ? {
                ...d,
                inkasso_stage:
                  (stage as Deal["inkasso_stage"]) ?? null,
                inkasso_stage_updated_at: new Date().toISOString(),
                dunning_status: j.resolved
                  ? ("resolved" as const)
                  : d.dunning_status,
              }
            : d,
        ),
      );
    } catch (e) {
      alert(`Fehler: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = deals.filter((d) => {
      if (!d.dunning_status && !d.inkasso_stage) return false;
      // 'Erledigte' (resolved + inkasso-stage gewonnen/verloren)
      // werden per Default ausgeblendet -- typischer Workflow ist
      // 'was muss ich aktuell tun?'. Mit Checkbox aufdeckbar.
      if (
        hideResolved &&
        (d.dunning_status === "resolved" ||
          d.inkasso_stage === "gewonnen" ||
          d.inkasso_stage === "verloren")
      ) {
        return false;
      }
      if (statusFilter !== "all" && d.dunning_status !== statusFilter) {
        return false;
      }
      if (stageFilter !== "all") {
        if (stageFilter === "none" && d.inkasso_stage) return false;
        if (stageFilter !== "none" && d.inkasso_stage !== stageFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${d.vorname ?? ""} ${d.nachname ?? ""} ${d.email ?? ""} ${d.mitarbeiter_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      // Ueberfaellige Inkasso-Frist zuerst (kleiner due_at = dringender)
      const da = a.dunning_inkasso_due_at ?? "9999-99-99";
      const db = b.dunning_inkasso_due_at ?? "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      // Dann nach updated_at DESC (neueste Aenderung oben)
      const ua = a.dunning_updated_at ?? "0";
      const ub = b.dunning_updated_at ?? "0";
      return ub.localeCompare(ua);
    });
    return rows;
  }, [deals, statusFilter, stageFilter, search, hideResolved]);

  const counts = useMemo(() => {
    const c = { mahnung_1: 0, mahnung_2: 0, inkasso: 0, resolved: 0 };
    let fees = 0;
    let offen = 0;
    for (const d of deals) {
      if (!d.dunning_status) continue;
      c[d.dunning_status as keyof typeof c] =
        (c[d.dunning_status as keyof typeof c] ?? 0) + 1;
      fees += (d.dunning_total_fees_cents ?? 0) / 100;
      // grobe Offen-Schaetzung: vertrag_gesamtbetrag - bezahlt
      const total = Number(d.vertrag_gesamtbetrag ?? d.betrag_original ?? d.betrag ?? 0);
      const paid = (d.gocardless_paid_amount_cents ?? 0) / 100;
      offen += Math.max(0, total - paid);
    }
    return { ...c, fees, offen };
  }, [deals]);

  const now = new Date().toISOString();

  return (
    <div className="space-y-3">
      {/* Summen oben */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        <div className="bg-amber-50 rounded border border-amber-300 p-2">
          <div className="text-[10px] uppercase text-amber-900/70">
            1. Mahnung
          </div>
          <div className="font-semibold tabular-nums text-amber-900">
            {counts.mahnung_1}
          </div>
        </div>
        <div className="bg-red-50 rounded border border-red-300 p-2">
          <div className="text-[10px] uppercase text-red-900/70">
            2. Mahnung
          </div>
          <div className="font-semibold tabular-nums text-red-900">
            {counts.mahnung_2}
          </div>
        </div>
        <div className="bg-red-600 text-white rounded p-2">
          <div className="text-[10px] uppercase opacity-80">Inkasso</div>
          <div className="font-semibold tabular-nums">{counts.inkasso}</div>
        </div>
        <div className="bg-amber-50 rounded border border-amber-300 p-2">
          <div className="text-[10px] uppercase text-amber-900/70">
            Gebühren ges.
          </div>
          <div className="font-semibold tabular-nums text-amber-900">
            {eur(counts.fees)}
          </div>
        </div>
        <div className="bg-blue-50 rounded border border-blue-300 p-2">
          <div className="text-[10px] uppercase text-blue-900/70">
            Offen (≈)
          </div>
          <div className="font-semibold tabular-nums text-blue-900">
            {eur(counts.offen)}
          </div>
        </div>
      </div>

      {/* Filter */}
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
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          >
            <option value="all">Alle</option>
            <option value="mahnung_1">1. Mahnung</option>
            <option value="mahnung_2">2. Mahnung</option>
            <option value="inkasso">Inkasso</option>
            <option value="resolved">Erledigt</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Inkasso-Stage
          </label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as StageFilter)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          >
            <option value="all">Alle</option>
            <option value="none">(ohne Zuordnung)</option>
            <option value="ergo">Bei Ergo</option>
            <option value="anwalt">Bei Anwalt</option>
            <option value="gericht">Vor Gericht</option>
            <option value="gewonnen">Gewonnen</option>
            <option value="verloren">Verloren</option>
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label
            className="inline-flex items-center gap-1.5 text-xs text-[color:var(--muted)] cursor-pointer select-none"
            title="Versteckt Faelle mit Mahn-Status 'resolved' oder Inkasso-Stage 'gewonnen'/'verloren'. Aufdecken um die Historie zu sehen."
          >
            <input
              type="checkbox"
              checked={hideResolved}
              onChange={(e) => setHideResolved(e.target.checked)}
              className="cursor-pointer"
            />
            <span>Erledigte ausblenden</span>
          </label>
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)] text-xs uppercase">
            <tr className="text-left">
              <th className="px-3 py-2">Kunde</th>
              <th className="px-3 py-2">Mitarbeiter</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Inkasso-Stage</th>
              <th className="px-3 py-2 text-right" title="Offener Betrag = Vertragssumme - bereits bezahlt (fuer Provisions-Rueckabwicklung)">
                Offen
              </th>
              <th className="px-3 py-2 text-right">Mahnungen</th>
              <th className="px-3 py-2 text-right">Gebühren</th>
              <th className="px-3 py-2">Letzte Email</th>
              <th className="px-3 py-2">Inkasso-Frist</th>
              <th className="px-3 py-2">Inkasso vers.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-sm text-[color:var(--muted)]"
                >
                  {deals.some((d) => d.dunning_status)
                    ? "Keine Einträge passen zu den Filtern."
                    : "Aktuell keine offenen Mahnungen oder Inkasso-Fälle. 🎉"}
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                const stat = statusBadge(d.dunning_status);
                const due = d.dunning_inkasso_due_at;
                const overdue =
                  due && due < now && !d.dunning_inkasso_sent_at;
                const fees = (d.dunning_total_fees_cents ?? 0) / 100;
                const totalVertrag = Number(
                  d.vertrag_gesamtbetrag ??
                    d.betrag_original ??
                    d.betrag ??
                    0,
                );
                const paidEur =
                  (d.gocardless_paid_amount_cents ?? 0) / 100;
                const offen = Math.max(0, totalVertrag - paidEur);
                return (
                  <tr
                    key={d.id}
                    onClick={() => setDetailDeal(d)}
                    className={
                      "border-t border-[color:var(--border)] cursor-pointer hover:bg-[color:var(--surface)]/50 " +
                      (overdue ? "bg-red-50" : "")
                    }
                    title="Klicken für Detail-Ansicht und Aktionen"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {d.nachname}
                        {d.vorname ? `, ${d.vorname}` : ""}
                      </div>
                      {d.email ? (
                        <div className="text-[11px] text-[color:var(--muted)]">
                          {d.email}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                      {d.mitarbeiter_name || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border " +
                          stat.cls
                        }
                      >
                        {stat.label}
                      </span>
                    </td>
                    <td className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <select
                          value={d.inkasso_stage ?? ""}
                          disabled={savingId === d.id}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateStage(d, v || null);
                          }}
                          className={
                            "text-[11px] px-1.5 py-0.5 rounded border " +
                            (d.inkasso_stage
                              ? STAGE_CLS[d.inkasso_stage]
                              : "bg-white border-gray-300 text-gray-700")
                          }
                          title={d.inkasso_stage_note ?? ""}
                        >
                          <option value="">— wählen —</option>
                          <option value="ergo">Bei Ergo</option>
                          <option value="anwalt">Bei Anwalt</option>
                          <option value="gericht">Vor Gericht</option>
                          <option value="gewonnen">Gewonnen</option>
                          <option value="verloren">Verloren</option>
                        </select>
                      ) : d.inkasso_stage ? (
                        <span
                          className={
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border " +
                            STAGE_CLS[d.inkasso_stage]
                          }
                        >
                          {STAGE_LABELS[d.inkasso_stage]}
                        </span>
                      ) : (
                        <span className="text-[color:var(--muted)] text-xs">—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold text-red-900"
                      title={`Vertragssumme: ${eur(totalVertrag)} -- bezahlt: ${eur(paidEur)} = offen ${eur(offen)}. Fuer Provisions-Rueckabwicklung relevant.`}
                    >
                      {offen > 0 ? eur(offen) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {d.dunning_mahnung_count ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fees > 0 ? eur(fees) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {formatDateTime(d.dunning_last_email_at)}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-xs " +
                        (overdue ? "text-red-700 font-bold" : "")
                      }
                    >
                      {due ? (
                        <>
                          {formatDate(due)}
                          {overdue ? " (überfällig!)" : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {formatDateTime(d.dunning_inkasso_sent_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {detailDeal ? (
        <PaymentDetailModal
          deal={detailDeal}
          onClose={() => setDetailDeal(null)}
          canManageDunning={canEdit}
        />
      ) : null}
    </div>
  );
}
