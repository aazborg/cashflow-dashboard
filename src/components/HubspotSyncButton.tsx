"use client";

import { useState, useTransition } from "react";
import {
  syncHubspotDealsAction,
  syncHubspotSnapshotsAction,
  type SnapshotsResult,
  type SyncResult,
} from "@/lib/actions";

export default function HubspotSyncButton() {
  const [dealsPending, startDealsTransition] = useTransition();
  const [snapshotsPending, startSnapshotsTransition] = useTransition();
  const [dealsResult, setDealsResult] = useState<SyncResult | null>(null);
  const [snapshotsResult, setSnapshotsResult] =
    useState<SnapshotsResult | null>(null);

  function triggerDeals() {
    setDealsResult(null);
    startDealsTransition(async () => {
      const r = await syncHubspotDealsAction();
      setDealsResult(r);
    });
  }

  function triggerSnapshots() {
    setSnapshotsResult(null);
    startSnapshotsTransition(async () => {
      const r = await syncHubspotSnapshotsAction();
      setSnapshotsResult(r);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={triggerDeals}
            disabled={dealsPending}
            className="px-3 py-1.5 rounded-md bg-[color:var(--brand-yellow)] border border-[color:var(--brand-orange)]/30 text-sm font-medium hover:bg-[color:var(--brand-orange)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {dealsPending ? "Synchronisiere…" : "Won-Deals synchronisieren"}
          </button>
          <span className="text-xs text-[color:var(--muted)]">
            Neue Won-Deals der Neukunden-Pipeline einlesen. Bestehende Deals
            bleiben unangetastet.
          </span>
        </div>
        {dealsResult?.ok && dealsResult.summary ? (
          <div className="text-xs text-[color:var(--muted)]">
            ✓ Fertig in {(dealsResult.summary.duration_ms / 1000).toFixed(1)}s —{" "}
            {dealsResult.summary.total} Deals geprüft (
            {dealsResult.summary.created} neu,{" "}
            {dealsResult.summary.skipped_existing} bereits vorhanden
            {dealsResult.summary.unmatched_owners > 0
              ? `, ${dealsResult.summary.unmatched_owners} ohne Mitarbeiter`
              : ""}
            {dealsResult.summary.errors.length > 0
              ? `, ${dealsResult.summary.errors.length} Fehler`
              : ""}
            ).
          </div>
        ) : null}
        {dealsResult && !dealsResult.ok ? (
          <div className="text-xs text-red-700">Fehler: {dealsResult.error}</div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 pt-3 border-t border-[color:var(--border)]">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={triggerSnapshots}
            disabled={snapshotsPending}
            className="px-3 py-1.5 rounded-md bg-[color:var(--brand-yellow)] border border-[color:var(--brand-orange)]/30 text-sm font-medium hover:bg-[color:var(--brand-orange)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {snapshotsPending
              ? "Synchronisiere…"
              : "Monats-Snapshots aus HubSpot ziehen"}
          </button>
          <span className="text-xs text-[color:var(--muted)]">
            Qualis, Showup-Rate, Close-Rate und Ø Vertragswert pro Mitarbeiter
            pro Monat (Beratungsgespräche + Won-Deals der Neukunden-Pipeline).
            Backfill ab Januar 2026. Cron: 1. jedes Monats.
          </span>
        </div>
        {snapshotsResult?.ok && snapshotsResult.summary ? (
          <div className="text-xs text-[color:var(--muted)]">
            ✓ Fertig in{" "}
            {(snapshotsResult.summary.duration_ms / 1000).toFixed(1)}s —{" "}
            {snapshotsResult.summary.snapshots_written} Snapshots geschrieben (
            {snapshotsResult.summary.from_month} bis{" "}
            {snapshotsResult.summary.to_month};{" "}
            {snapshotsResult.summary.meetings_total} Meetings,{" "}
            {snapshotsResult.summary.won_total} Won-Deals
            {snapshotsResult.summary.unmatched_owners > 0
              ? `, ${snapshotsResult.summary.unmatched_owners} unbekannte Owner`
              : ""}
            ).
          </div>
        ) : null}
        {snapshotsResult && !snapshotsResult.ok ? (
          <div className="text-xs text-red-700">
            Fehler: {snapshotsResult.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
