/**
 * Tab-Switcher fuer /zahlungen:
 *   - 'Kunden'         -> ZahlungenTable (eine Zeile pro Deal)
 *   - 'Alle Zahlungen' -> AllPaymentsTable (eine Zeile pro Payment)
 */
"use client";

import { useMemo, useState } from "react";
import ZahlungenTable from "@/components/ZahlungenTable";
import AllPaymentsTable from "@/components/AllPaymentsTable";
import MandatesTable from "@/components/MandatesTable";
import ManualMandateModal from "@/components/ManualMandateModal";
import InkassoTable from "@/components/InkassoTable";
import type { Deal, Employee } from "@/lib/types";

export type DealOverride = {
  dunning_status?:
    | "mahnung_1"
    | "mahnung_2"
    | "inkasso"
    | "resolved"
    | null;
};
export type DealOverrides = Map<string, DealOverride>;

type Tab = "kunden" | "zahlungen" | "fehlgeschlagen" | "storniert" | "rueckbelastungen" | "geloeschte_mandate" | "inkasso";

interface Props {
  deals: Deal[];
  employees: Employee[];
  isAdmin: boolean;
  canManagePayments?: boolean;
}

export default function ZahlungenTabs({
  deals, employees, isAdmin,
  canManagePayments = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("kunden");
  const [manualOpen, setManualOpen] = useState(false);
  // Tab-uebergreifende lokale Deal-Overrides. Wird gefuellt wenn der
  // User pro Zeile den Mahn-Status setzt -- damit beim Tab-Wechsel
  // (Failed -> Inkasso) die Aenderung sichtbar bleibt, OHNE die
  // ganze Server-Seite refetchen zu muessen.
  const [overrides, setOverrides] = useState<DealOverrides>(new Map());
  const onDealUpdate = (id: string, patch: DealOverride) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) ?? {};
      next.set(id, { ...existing, ...patch });
      return next;
    });
  };
  const effectiveDeals = useMemo(() => {
    if (overrides.size === 0) return deals;
    return deals.map((d) => {
      const o = overrides.get(d.id);
      if (!o) return d;
      return { ...d, ...o };
    });
  }, [deals, overrides]);
  return (
    <div className="space-y-3">
      <div className="flex justify-end -mb-1">
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="text-xs px-3 py-1.5 rounded border border-purple-600 text-purple-600 hover:bg-purple-600/10 font-medium"
          title="SEPA-Mandat ohne Vertrag-PDF manuell erfassen (z.B. fuer Bestandskunden)"
        >
          + Neues Mandat anlegen
        </button>
      </div>
      <div className="flex gap-1 border-b border-[color:var(--border)] overflow-x-auto">
        <TabBtn active={tab === "kunden"} onClick={() => setTab("kunden")}>
          Kunden
        </TabBtn>
        <TabBtn
          active={tab === "zahlungen"}
          onClick={() => setTab("zahlungen")}
        >
          Alle Zahlungen
        </TabBtn>
        <TabBtn
          active={tab === "fehlgeschlagen"}
          onClick={() => setTab("fehlgeschlagen")}
        >
          Fehlgeschlagene Zahlungen
        </TabBtn>
        <TabBtn
          active={tab === "storniert"}
          onClick={() => setTab("storniert")}
        >
          Stornierte Zahlungen
        </TabBtn>
        <TabBtn
          active={tab === "rueckbelastungen"}
          onClick={() => setTab("rueckbelastungen")}
        >
          Rückbelastungen
        </TabBtn>
        <TabBtn
          active={tab === "geloeschte_mandate"}
          onClick={() => setTab("geloeschte_mandate")}
        >
          Mandate gelöscht
        </TabBtn>
        <TabBtn
          active={tab === "inkasso"}
          onClick={() => setTab("inkasso")}
        >
          Mahnungen / Inkasso
        </TabBtn>
      </div>
      {tab === "kunden" ? (
        <ZahlungenTable
          deals={effectiveDeals}
          employees={employees}
          isAdmin={isAdmin}
          canManageDunning={canManagePayments}
        />
      ) : tab === "zahlungen" ? (
        <AllPaymentsTable
          key="all"
          deals={effectiveDeals}
          canManageDunning={canManagePayments}
        />
      ) : tab === "fehlgeschlagen" ? (
        <AllPaymentsTable
          key="failed"
          defaultStatus="failed"
          deals={effectiveDeals}
          canManageDunning={canManagePayments}
          onDealUpdate={onDealUpdate}
          emptyMessage="Aktuell keine fehlgeschlagenen Zahlungen. 🎉"
        />
      ) : tab === "storniert" ? (
        <AllPaymentsTable
          key="cancelled"
          defaultStatus="cancelled"
          deals={effectiveDeals}
          canManageDunning={canManagePayments}
          onDealUpdate={onDealUpdate}
          groupByCustomer
          emptyMessage="Aktuell keine stornierten Zahlungen."
        />
      ) : tab === "rueckbelastungen" ? (
        <AllPaymentsTable
          key="chargeback"
          defaultStatus="chargeback"
          deals={effectiveDeals}
          canManageDunning={canManagePayments}
          onDealUpdate={onDealUpdate}
          emptyMessage="Aktuell keine Rückbelastungen (charged_back). 🎉"
        />
      ) : tab === "geloeschte_mandate" ? (
        <MandatesTable
          key="cancelled-mandates"
          statusFilter="cancelled,expired,blocked"
          emptyMessage="Keine gelöschten/abgelaufenen/blockierten Mandate."
        />
      ) : (
        <InkassoTable
          deals={effectiveDeals}
          isAdmin={isAdmin}
          canManageDunning={canManagePayments}
        />
      )}

      {manualOpen ? (
        <ManualMandateModal
          onClose={() => setManualOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition " +
        (active
          ? "border-[color:var(--brand-orange)] text-[color:var(--foreground)]"
          : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
      }
    >
      {children}
    </button>
  );
}
