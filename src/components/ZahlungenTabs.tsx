/**
 * Tab-Switcher fuer /zahlungen:
 *   - 'Kunden'         -> ZahlungenTable (eine Zeile pro Deal)
 *   - 'Alle Zahlungen' -> AllPaymentsTable (eine Zeile pro Payment)
 */
"use client";

import { useState } from "react";
import ZahlungenTable from "@/components/ZahlungenTable";
import AllPaymentsTable from "@/components/AllPaymentsTable";
import MandatesTable from "@/components/MandatesTable";
import ManualMandateModal from "@/components/ManualMandateModal";
import type { Deal, Employee } from "@/lib/types";

type Tab = "kunden" | "zahlungen" | "rueckbelastungen" | "geloeschte_mandate";

interface Props {
  deals: Deal[];
  employees: Employee[];
  isAdmin: boolean;
}

export default function ZahlungenTabs({ deals, employees, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>("kunden");
  const [manualOpen, setManualOpen] = useState(false);
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
      </div>
      {tab === "kunden" ? (
        <ZahlungenTable
          deals={deals}
          employees={employees}
          isAdmin={isAdmin}
        />
      ) : tab === "zahlungen" ? (
        <AllPaymentsTable key="all" />
      ) : tab === "rueckbelastungen" ? (
        <AllPaymentsTable
          key="chargeback"
          defaultStatus="chargeback"
          emptyMessage="Aktuell keine Rückbelastungen (charged_back). 🎉"
        />
      ) : (
        <MandatesTable
          key="cancelled-mandates"
          statusFilter="cancelled,expired,blocked"
          emptyMessage="Keine gelöschten/abgelaufenen/blockierten Mandate."
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
