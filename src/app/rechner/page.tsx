import RechnerClient, {
  type EmployeeOption,
} from "@/components/RechnerClient";
import {
  avgVerkaufspreis,
  cashDistribution,
  monthlySeriesForMitarbeiter,
} from "@/lib/cashflow";
import {
  listDeals,
  listEmployees,
  listMonthlySnapshots,
} from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RechnerPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const [employees, deals, allSnapshots] = await Promise.all([
    listEmployees(),
    listDeals(),
    listMonthlySnapshots(),
  ]);

  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  const until = new Date(now.getFullYear() + 1, 11, 1);

  // Team-Ø-Vertragswert aus den HubSpot-Monats-Snapshots (avg_contract pro
  // Mitarbeiter pro Monat, gemittelt über alle Snapshots mit Wert).
  const snapshotAvgs = allSnapshots
    .map((s) => s.avg_contract)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const teamAvgContract =
    snapshotAvgs.length > 0
      ? snapshotAvgs.reduce((s, v) => s + v, 0) / snapshotAvgs.length
      : 0;

  // Members see only their own row; admins see all members.
  const visibleEmployees = ctx.isAdmin
    ? employees.filter((e) => e.role === "member")
    : employees.filter((e) => (e.hubspot_owner_id ?? e.id) === ctx.ownerId);

  const options: EmployeeOption[] = visibleEmployees
    .map((e) => {
      const mitId = e.hubspot_owner_id ?? e.id;
      const series = monthlySeriesForMitarbeiter(deals, mitId, {
        from,
        until,
        now,
      });
      const derivedAvg = avgVerkaufspreis(deals, mitId);
      const distribution = cashDistribution(deals, mitId);
      const snapshots = allSnapshots.filter((s) => s.mitarbeiter_id === mitId);
      return {
        id: e.id,
        mitarbeiter_id: mitId,
        name: e.name,
        provision_pct: e.provision_pct ?? null,
        default_qualis: e.default_qualis ?? null,
        default_showup_rate: e.default_showup_rate ?? null,
        default_close_rate: e.default_close_rate ?? null,
        default_avg_contract: e.default_avg_contract ?? null,
        derived_avg_contract: derivedAvg,
        committed_series: series,
        cash_distribution: distribution,
        monthly_snapshots: snapshots,
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gehalts-Rechner</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Spiel mit den Funnel-Zahlen — die <strong>Vergangenheit</strong> ist
          fixiert, die <strong>Zukunft</strong> rechnet sich live mit. So siehst
          du, mit welchen kleinen Stellhebeln du dein Jahresgehalt bewegst.
        </p>
      </div>
      {options.length === 0 ? (
        <div className="bg-white border border-[color:var(--border)] rounded-lg p-8 text-center text-sm text-[color:var(--muted)]">
          Noch keine Mitarbeiter angelegt — bitte im Admin einladen.
        </div>
      ) : (
        <RechnerClient
          employees={options}
          nowIso={now.toISOString()}
          teamAvgContract={teamAvgContract}
        />
      )}
    </div>
  );
}
