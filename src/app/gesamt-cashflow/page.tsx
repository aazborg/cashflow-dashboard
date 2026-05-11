import PerMitarbeiterCashflowChart, {
  type PerMitSeriesPoint,
} from "@/components/PerMitarbeiterCashflowChart";
import YearFilter from "@/components/YearFilter";
import {
  buildCashflow,
  expandPayments,
  formatEUR,
} from "@/lib/cashflow";
import { SETTER_TARIFFS } from "@/lib/setter-tiers";
import { listDeals, listEmployees } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PALETTE = [
  "#449dd7",
  "#53b684",
  "#f28a26",
  "#ffd857",
  "#6b7280",
  "#9a5e00",
  "#1a1a1a",
  "#c0392b",
];

export default async function GesamtCashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  // Nur Admins — die Seite zeigt die HubSpot-Original-Beträge, die für
  // Mitarbeiter ausdrücklich nicht sichtbar sein sollen.
  if (!ctx.isAdmin) redirect("/");

  const { year: yearRaw } = await searchParams;
  const [allDeals, employees] = await Promise.all([listDeals(), listEmployees()]);

  // Payout-Lookups analog zum Hauptdashboard.
  const provisionByMitId = new Map<string, number>();
  for (const e of employees) {
    if (e.provision_pct == null) continue;
    if (e.hubspot_owner_id) provisionByMitId.set(e.hubspot_owner_id, e.provision_pct);
    provisionByMitId.set(e.id, e.provision_pct);
  }
  const fixumByMitId = new Map<string, number>();
  const employmentStartByMitId = new Map<string, string>();
  const employmentEndByMitId = new Map<string, string>();
  for (const e of employees) {
    const setterFix = e.setter_hours
      ? SETTER_TARIFFS[e.setter_hours]?.fixum ?? 0
      : 0;
    const closerFix = e.closer_fixum_eur ?? 0;
    const fix = setterFix + closerFix;
    if (fix > 0) {
      if (e.hubspot_owner_id) fixumByMitId.set(e.hubspot_owner_id, fix);
      fixumByMitId.set(e.id, fix);
    }
    if (e.employment_start) {
      if (e.hubspot_owner_id) employmentStartByMitId.set(e.hubspot_owner_id, e.employment_start);
      employmentStartByMitId.set(e.id, e.employment_start);
    }
    if (e.employment_end) {
      if (e.hubspot_owner_id) employmentEndByMitId.set(e.hubspot_owner_id, e.employment_end);
      employmentEndByMitId.set(e.id, e.employment_end);
    }
  }
  const fixumPaymentsInMonth = (m: number): number =>
    m === 6 || m === 11 ? 2 : 1;
  const monthFromKey = (key: string): number =>
    Number.parseInt(key.split("-")[1] ?? "0", 10);
  const monthlyFixFor = (mitId: string, monthKey: string): number => {
    const fix = fixumByMitId.get(mitId) ?? 0;
    if (fix <= 0) return 0;
    const start = employmentStartByMitId.get(mitId);
    if (start && monthKey < start.slice(0, 7)) return 0;
    const end = employmentEndByMitId.get(mitId);
    if (end && monthKey > end.slice(0, 7)) return 0;
    return fix;
  };
  const monthlyPayout = (
    mitId: string,
    commissionBase: number,
    monthKey: string,
  ): number => {
    const p = provisionByMitId.get(mitId);
    const fix = monthlyFixFor(mitId, monthKey);
    const variable = p != null ? (commissionBase * p) / 100 : 0;
    const fixCount = fixumPaymentsInMonth(monthFromKey(monthKey));
    return variable + fix * fixCount;
  };

  const currentYear = new Date().getFullYear();
  const yearsFromPayments = new Set<number>();
  for (const d of allDeals) {
    for (const p of expandPayments(d)) yearsFromPayments.add(p.date.getFullYear());
  }
  yearsFromPayments.add(currentYear);
  yearsFromPayments.add(currentYear + 1);
  const availableYears = [...yearsFromPayments].sort((a, b) => b - a);
  const parsedYear = Number.parseInt(yearRaw ?? "", 10);
  const selectedYear = availableYears.includes(parsedYear) ? parsedYear : currentYear;

  const yearStart = new Date(selectedYear, 0, 1);
  const { mitarbeiter, rows } = buildCashflow(allDeals, { from: yearStart });

  // Mitarbeiter nach FY-Beitrag absteigend sortieren — visuelle Sortierung im Chart
  // ist sonst zufällig.
  const totalsByMit = new Map<string, number>();
  for (const r of rows) {
    for (const [mitId, amount] of Object.entries(r.byMitarbeiterOriginal)) {
      totalsByMit.set(mitId, (totalsByMit.get(mitId) ?? 0) + amount);
    }
  }
  const sortedMit = [...mitarbeiter].sort(
    (a, b) => (totalsByMit.get(b.id) ?? 0) - (totalsByMit.get(a.id) ?? 0),
  );

  const chartMit = sortedMit.map((m, i) => ({
    id: m.id,
    name: m.name,
    color: PALETTE[i % PALETTE.length],
  }));

  const chartData: PerMitSeriesPoint[] = rows.map((r) => {
    const point: PerMitSeriesPoint = { monthLabel: r.monthLabel };
    for (const m of sortedMit) {
      point[m.id] = r.byMitarbeiterOriginal[m.id] ?? 0;
    }
    return point;
  });

  const nowKey = `${new Date().getFullYear()}-${String(
    new Date().getMonth() + 1,
  ).padStart(2, "0")}`;
  const nowIndex = rows.findIndex((r) => r.month === nowKey);

  // Gesamtsummen pro Mitarbeiter und insgesamt für den FY-Bereich.
  const grandTotal = rows.reduce((s, r) => s + r.totalOriginal, 0);
  const commissionTotal = rows.reduce((s, r) => s + r.total, 0);
  const restTotal = grandTotal - commissionTotal;

  // Differenz pro Mitarbeiter (Original − Provisions-Basis) — wo der
  // Mitarbeiter seinen Betrag nach unten korrigiert hat, kommt diese
  // Lücke in den "Company-Rest".
  const diffByMit = new Map<string, number>();
  for (const r of rows) {
    for (const m of sortedMit) {
      const orig = r.byMitarbeiterOriginal[m.id] ?? 0;
      const adj = r.byMitarbeiter[m.id] ?? 0;
      diffByMit.set(m.id, (diffByMit.get(m.id) ?? 0) + (orig - adj));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gesamt-Cashflow</h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Vollständiger HubSpot-Originalbetrag pro Deal, monatlich verteilt nach
            Intervall und Anzahl Raten. Admin-Ansicht — Mitarbeiter sehen nur
            ihren angepassten Anteil.
          </p>
        </div>
        <YearFilter years={availableYears} current={selectedYear} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={`Gesamt-Cashflow ${selectedYear}+`}
          value={formatEUR(grandTotal)}
          sub={`${sortedMit.length} Mitarbeiter · ${rows.length} Monate`}
          accent="blue"
        />
        <KpiCard
          label="Provisions-Basis Σ"
          value={formatEUR(commissionTotal)}
          sub="Summe der editierbaren Mitarbeiter-Beträge"
          accent="green"
        />
        <KpiCard
          label="Company-Rest Σ"
          value={formatEUR(restTotal)}
          sub="Differenz Original − Provisionsbasis (Mitarbeiter haben gekürzt)"
          accent="orange"
        />
      </div>

      <section className="bg-white border border-[color:var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-semibold">Cashflow-Kurve pro Mitarbeiter</h2>
          <span className="text-xs text-[color:var(--muted)]">
            Jede Linie = monatliche Cashflow-Beiträge eines Mitarbeiters (Original-HubSpot-Wert)
          </span>
        </div>
        <PerMitarbeiterCashflowChart
          data={chartData}
          mitarbeiter={chartMit}
          nowIndex={nowIndex}
        />
      </section>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[color:var(--border)] flex items-center justify-between">
          <h2 className="font-semibold">Gesamt-Cashflow je Monat</h2>
          <span className="text-xs text-[color:var(--muted)]">
            Σ Gesamt = Σ aller Original-Beträge · Rest = nicht-Provisions-Anteil
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)]">
              <tr>
                <th className="text-left px-4 py-2 font-medium sticky left-0 bg-[color:var(--surface)] z-10">
                  Monat
                </th>
                <th className="text-right px-4 py-2 font-medium">Σ Gesamt</th>
                <th className="text-right px-4 py-2 font-medium">Provisions-Basis</th>
                <th className="text-right px-4 py-2 font-medium">Company-Rest</th>
                {chartMit.map((m) => (
                  <th
                    key={m.id}
                    className="text-right px-4 py-2 font-medium whitespace-nowrap"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                      style={{ background: m.color }}
                    />
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const restMonth = r.totalOriginal - r.total;
                const auszahlungByMit: Record<string, number> = {};
                for (const m of chartMit) {
                  auszahlungByMit[m.id] = monthlyPayout(
                    m.id,
                    r.byMitarbeiter[m.id] ?? 0,
                    r.month,
                  );
                }
                const totalAuszahlung = Object.values(auszahlungByMit).reduce(
                  (s, v) => s + v,
                  0,
                );
                return (
                  <tr
                    key={r.month}
                    className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                  >
                    <td className="px-4 py-2 sticky left-0 bg-white">{r.monthLabel}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      <div>{r.totalOriginal > 0 ? formatEUR(r.totalOriginal) : "—"}</div>
                      {totalAuszahlung > 0.5 ? (
                        <div className="text-[10px] text-[color:var(--brand-green)] font-normal">
                          Auszahlung {formatEUR(totalAuszahlung)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[color:var(--muted)]">
                      {r.total > 0 ? formatEUR(r.total) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[color:var(--brand-orange)]">
                      {restMonth > 0.5 ? formatEUR(restMonth) : "—"}
                    </td>
                    {chartMit.map((m) => {
                      const cf = r.byMitarbeiterOriginal[m.id] ?? 0;
                      const pay = auszahlungByMit[m.id];
                      return (
                        <td
                          key={m.id}
                          className="px-4 py-2 text-right tabular-nums text-[color:var(--muted)]"
                        >
                          <div>{cf > 0 ? formatEUR(cf) : "—"}</div>
                          {pay > 0.5 ? (
                            <div className="text-[10px] text-[color:var(--brand-green)] font-normal">
                              Auszahlung {formatEUR(pay)}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[color:var(--border)] bg-[color:var(--surface)]">
                <td className="px-4 py-2 font-medium sticky left-0 bg-[color:var(--surface)] z-10">
                  Σ {selectedYear}+
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">
                  {formatEUR(grandTotal)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-[color:var(--muted)]">
                  {formatEUR(commissionTotal)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-[color:var(--brand-orange)]">
                  {formatEUR(restTotal)}
                </td>
                {chartMit.map((m) => {
                  const sum = rows.reduce(
                    (s, r) => s + (r.byMitarbeiterOriginal[m.id] ?? 0),
                    0,
                  );
                  const diff = diffByMit.get(m.id) ?? 0;
                  return (
                    <td
                      key={m.id}
                      className="px-4 py-2 text-right tabular-nums font-semibold"
                    >
                      <div>{formatEUR(sum)}</div>
                      {diff > 0.5 ? (
                        <div className="text-[10px] text-[color:var(--brand-orange)] font-normal">
                          −{formatEUR(diff)} gekürzt
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "blue" | "green" | "orange" | "yellow";
}) {
  const accentColor =
    accent === "blue"
      ? "var(--brand-blue)"
      : accent === "green"
      ? "var(--brand-green)"
      : accent === "orange"
      ? "var(--brand-orange)"
      : "var(--brand-yellow)";
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: accentColor }}
      />
      <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub ? (
        <div className="text-xs text-[color:var(--muted)] mt-1">{sub}</div>
      ) : null}
    </div>
  );
}
