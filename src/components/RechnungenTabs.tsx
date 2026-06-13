"use client";
import { useState } from "react";
import RechnungenClient from "./RechnungenClient";
import AusgangsrechnungenClient from "./AusgangsrechnungenClient";
import InvoiceUploadCard from "./InvoiceUploadCard";

export default function RechnungenTabs() {
  const [tab, setTab] = useState<"eingang" | "ausgang" | "storno">("eingang");
  const tabCls = (active: boolean) =>
    "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition " +
    (active
      ? "border-[color:var(--brand-orange)] text-[color:var(--foreground)]"
      : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-[color:var(--border)]">
        <button
          type="button"
          onClick={() => setTab("eingang")}
          className={tabCls(tab === "eingang")}
        >
          Eingangsrechnungen
        </button>
        <button
          type="button"
          onClick={() => setTab("ausgang")}
          className={tabCls(tab === "ausgang")}
        >
          Ausgangsrechnungen
        </button>
        <button
          type="button"
          onClick={() => setTab("storno")}
          className={tabCls(tab === "storno")}
        >
          Stornorechnungen
        </button>
      </div>

      {tab === "eingang" && (
        <div className="space-y-4">
          <InvoiceUploadCard source="rechnungen" />
          <RechnungenClient />
        </div>
      )}
      {tab === "ausgang" && <AusgangsrechnungenClient view="rechnung" />}
      {tab === "storno" && <AusgangsrechnungenClient view="storno" />}
    </div>
  );
}
