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
import type { Deal, Employee } from "@/lib/types";

type Tab = "kunden" | "zahlungen" | "rueckbelastungen" | "geloeschte_mandate";

interface Props {
  deals: Deal[];
  employees: Employee[];
  isAdmin: boolean;
}

export default function ZahlungenTabs({ deals, employees, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>("kunden");
  return (
    <div className="space-y-3">
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
        <AllPaymentsTable />
      ) : tab === "rueckbelastungen" ? (
        <AllPaymentsTable
          defaultStatus="chargeback"
          emptyMessage="Aktuell keine Rückbelastungen (charged_back). 🎉"
        />
      ) : (
        <MandatesTable
          statusFilter="cancelled,expired,blocked"
          emptyMessage="Keine gelöschten/abgelaufenen/blockierten Mandate."
        />
      )}
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
