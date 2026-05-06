import ZieleClient, {
  type TeamBaseline,
  type ProductOption,
} from "@/components/ZieleClient";
import {
  listEmployees,
  listMonthlySnapshots,
  listProducts,
} from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ZielePage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/");
  const [employees, snapshots, products] = await Promise.all([
    listEmployees(),
    listMonthlySnapshots(),
    listProducts(),
  ]);

  // Fixer Ø-Vertragswert für Planungs-Rechnungen (Rechner & Ziele).
  const avgContractValue = 8789;

  const members = employees.filter((e) => e.role === "member" && e.active);

  // Latest snapshot per member, then average across members.
  const latestPerMember = members.map((m) => {
    const ownerId = m.hubspot_owner_id ?? m.id;
    const own = snapshots
      .filter((s) => s.mitarbeiter_id === ownerId)
      .sort((a, b) => b.month.localeCompare(a.month));
    return { member: m, snapshot: own[0] ?? null };
  });

  const withSnap = latestPerMember.filter((x) => x.snapshot !== null);
  const fallbackMembers = latestPerMember.filter((x) => x.snapshot === null);

  function avgFromSnap(key: "qualis" | "showup_rate" | "close_rate"): number | null {
    if (withSnap.length === 0) return null;
    const sum = withSnap.reduce((s, x) => s + (x.snapshot![key] ?? 0), 0);
    return sum / withSnap.length;
  }

  function avgFromDefaults(key: "default_qualis" | "default_showup_rate" | "default_close_rate"): number | null {
    const vals = members
      .map((m) => m[key])
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  const teamQualis =
    avgFromSnap("qualis") ?? avgFromDefaults("default_qualis") ?? 20;
  const teamShowup =
    avgFromSnap("showup_rate") ?? avgFromDefaults("default_showup_rate") ?? 70;
  const teamClose =
    avgFromSnap("close_rate") ?? avgFromDefaults("default_close_rate") ?? 25;

  const baseline: TeamBaseline = {
    members_total: members.length,
    members_with_snapshot: withSnap.length,
    members_fallback: fallbackMembers.length,
    qualis_per_member: teamQualis,
    showup_rate: teamShowup,
    close_rate: teamClose,
    avg_contract_value: avgContractValue,
    avg_contract_deal_count: 0,
    source:
      withSnap.length > 0
        ? withSnap.length === members.length
          ? "snapshots"
          : "mixed"
        : "defaults",
  };

  const productOptions: ProductOption[] = products
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      default_anzahl_raten: p.default_anzahl_raten,
      default_intervall: p.default_intervall,
      is_upsell: p.is_upsell ?? false,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales-Ziele-Rechner</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Definiere, wie viele Stück du <strong>pro Monat</strong> von welchem Produkt verkaufen willst.
          Aus dem Team-Ø für Showup- und Closing-Rate leitet sich automatisch ab,
          wie viele Beratungsgespräche dafür nötig sind.
        </p>
      </div>
      <ZieleClient products={productOptions} baseline={baseline} />
    </div>
  );
}
