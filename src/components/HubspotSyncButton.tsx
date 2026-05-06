"use client";

import { useState, useTransition } from "react";
import { syncHubspotDealsAction, type SyncResult } from "@/lib/actions";

export default function HubspotSyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  function trigger() {
    setResult(null);
    startTransition(async () => {
      const r = await syncHubspotDealsAction();
      setResult(r);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={trigger}
          disabled={pending}
          className="px-3 py-1.5 rounded-md bg-[color:var(--brand-yellow)] border border-[color:var(--brand-orange)]/30 text-sm font-medium hover:bg-[color:var(--brand-orange)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "Synchronisiere…" : "Jetzt aus HubSpot synchronisieren"}
        </button>
        <span className="text-xs text-[color:var(--muted)]">
          Holt alle Won-Deals der Neukunden-Pipeline. Cron läuft zusätzlich alle 30 Min.
        </span>
      </div>

      {result?.ok && result.summary ? (
        <div className="text-xs text-[color:var(--muted)]">
          ✓ Fertig in {(result.summary.duration_ms / 1000).toFixed(1)}s —{" "}
          {result.summary.total} Deals geprüft (
          {result.summary.created} neu angelegt,{" "}
          {result.summary.skipped_existing} bereits vorhanden, unverändert
          {result.summary.unmatched_owners > 0
            ? `, ${result.summary.unmatched_owners} ohne Mitarbeiter-Zuordnung`
            : ""}
          {result.summary.errors.length > 0
            ? `, ${result.summary.errors.length} Fehler`
            : ""}
          ).
        </div>
      ) : null}
      {result && !result.ok ? (
        <div className="text-xs text-red-700">Fehler: {result.error}</div>
      ) : null}
    </div>
  );
}
