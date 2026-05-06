import Link from "next/link";
import CashflowChart from "@/components/CashflowChart";
import MitarbeiterFilter from "@/components/MitarbeiterFilter";
import {
  buildCashflow,
  formatEUR,
  outstandingByMitarbeiter,
} from "@/lib/cashflow";
import { listDeals, listEmployees } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mitarbeiter?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const { mitarbeiter: filterIdRaw } = await searchParams;
  // Members can only see their own cashflow; ignore any filter override.
  const filterId = ctx.isAdmin ? filterIdRaw : ctx.ownerId;
  const [allDeals, employees] = await Promise.all([listDeals(), listEmployees()]);
  const allMitarbeiter = [
    ...new Map(
      allDeals.map((d) => [d.mitarbeiter_id, d.mitarbeiter_name]),
    ).entries(),
  ].map(([id, name]) => ({ id, name }));

  const provisionByMitId = new Map<string, number>();
  for (const e of employees) {
    if (e.provision_pct == null) continue;
    if (e.hubspot_owner_id) provisionByMitId.set(e.hubspot_owner_id, e.provision_pct);
    provisionByMitId.set(e.id, e.provision_pct);
  }
  const payout = (mitId: string, amount: number) => {
    const p = provisionByMitId.get(mitId);
    return p == null ? null : (amount * p) / 100;
  };

  const filteredDeals = filterId
    ? allDeals.filter((d) => d.mitarbeiter_id === filterId)
    : allDeals;

  const { mitarbeiter, rows } = buildCashflow(filteredDeals);
  const dealCount = filteredDeals.filter((d) => !d.pending_delete).length;
  const peakRow = rows.reduce(
    (a, b) => (b.total > a.total ? b : a),
    rows[0] ?? { total: 0, monthLabel: "—" },
  );

  const palette = ["#449dd7", "#53b684", "#f28a26", "#ffd857", "#6b7280"];
  const currentName = filterId
    ? allMitarbeiter.find((m) => m.id === filterId)?.name ??
      (filterId === ctx.ownerId ? ctx.employee.name : "Unbekannt")
    : null;

  const outstandingAll = outstandingByMitarbeiter(allDeals);
  const outstandingTotal = outstandingAll.reduce((s, r) => s + r.total, 0);
  const currentOutstanding = filterId
    ? outstandingAll.find((r) => r.mitarbeiter_id === filterId)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Cashflow-Dashboard
            {currentName ? (
              <span className="text-[color:var(--brand-blue)]"> · {currentName}</span>
            ) : null}
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            {currentName
              ? `Cashflow nur für ${currentName}.`
              : "Live-Übersicht der zukünftigen Zahlungseingänge je Mitarbeiter."}
          </p>
        </div>
        {ctx.isAdmin ? (
          <MitarbeiterFilter
            mitarbeiter={allMitarbeiter}
            current={filterId ?? null}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Aktive Deals" value={String(dealCount)} accent="blue" />
        <KpiCard
          label={currentName ? "Ausständig (ab heute)" : "Ausständig gesamt (ab heute)"}
          value={formatEUR(currentOutstanding ? currentOutstanding.total : outstandingTotal)}
          sub={
            currentOutstanding
              ? `${currentOutstanding.openPayments} offene Raten`
              : `${outstandingAll.reduce((s, r) => s + r.openPayments, 0)} offene Raten`
          }
          accent="yellow"
        />
        <KpiCard
          label="Stärkster Monat"
          value={`${formatEUR(peakRow.total)}`}
          sub={peakRow.monthLabel}
          accent="orange"
        />
      </div>

      {currentName ? null : (
        <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--border)] flex items-center justify-between">
            <h2 className="font-semibold">Ausständig pro Mitarbeiter</h2>
            <span className="text-xs text-[color:var(--muted)]">
              Summe aller noch offenen Raten ab diesem Monat
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
            {outstandingAll.map((r, i) => {
              const auszahlung = payout(r.mitarbeiter_id, r.total);
              const provPct = provisionByMitId.get(r.mitarbeiter_id);
              return (
                <Link
                  key={r.mitarbeiter_id}
                  href={`/?mitarbeiter=${encodeURIComponent(r.mitarbeiter_id)}`}
                  className="border border-[color:var(--border)] rounded-lg p-3 hover:border-[color:var(--brand-blue)] hover:bg-[color:var(--surface)] transition-colors block relative overflow-hidden"
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ background: palette[i % palette.length] }}
                  />
                  <div className="text-xs text-[color:var(--muted)] truncate pl-2">
                    {r.mitarbeiter_name}
                  </div>
                  <div className="text-lg font-semibold tabular-nums mt-1 pl-2">
                    {formatEUR(r.total)}
                  </div>
                  {auszahlung != null ? (
                    <div className="text-sm tabular-nums mt-1 pl-2 text-[color:var(--brand-green)] font-medium">
                      → {formatEUR(auszahlung)}
                    </div>
                  ) : null}
                  <div className="text-xs text-[color:var(--muted)] mt-1 pl-2">
                    {r.openPayments} Raten · {r.dealCount} Deals
                  </div>
                </Link>
              );
            })}
            {outstandingAll.length === 0 ? (
              <div className="col-span-full text-sm text-[color:var(--muted)] text-center py-6">
                Keine offenen Beträge.
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="bg-white border border-[color:var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">
            {currentName
              ? `Monatlicher Cashflow · ${currentName}`
              : "Monatlicher Cashflow gesamt"}
          </h2>
          <span className="text-xs text-[color:var(--muted)]">
            Ab diesem Monat bis zur letzten offenen Rate
          </span>
        </div>
        <CashflowChart
          data={rows.map((r) => ({ monthLabel: r.monthLabel, total: r.total }))}
        />
      </section>

      {currentName ? null : (
        <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--border)] flex items-center justify-between">
            <h2 className="font-semibold">Cashflow pro Mitarbeiter</h2>
            <span className="text-xs text-[color:var(--muted)]">
              {mitarbeiter.length} Mitarbeiter
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface)]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium sticky left-0 bg-[color:var(--surface)] z-10">
                    Monat
                  </th>
                  <th className="text-right px-4 py-2 font-medium">Gesamt</th>
                  {mitarbeiter.map((m, i) => (
                    <th
                      key={m.id}
                      className="text-right px-4 py-2 font-medium whitespace-nowrap"
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                        style={{ background: palette[i % palette.length] }}
                      />
                      {m.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.month}
                    className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                  >
                    <td className="px-4 py-2 sticky left-0 bg-white">{r.monthLabel}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {r.total > 0 ? formatEUR(r.total) : "—"}
                    </td>
                    {mitarbeiter.map((m) => (
                      <td
                        key={m.id}
                        className="px-4 py-2 text-right tabular-nums text-[color:var(--muted)]"
                      >
                        {(r.byMitarbeiter[m.id] ?? 0) > 0
                          ? formatEUR(r.byMitarbeiter[m.id]!)
                          : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {currentName ? (
        <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--border)]">
            <h2 className="font-semibold">Monatsübersicht · {currentName}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface)]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Monat</th>
                  <th className="text-right px-4 py-2 font-medium">Cashflow</th>
                  <th className="text-right px-4 py-2 font-medium">Auszahlung</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const auszahlung = filterId ? payout(filterId, r.total) : null;
                  return (
                    <tr
                      key={r.month}
                      className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                    >
                      <td className="px-4 py-2">{r.monthLabel}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.total > 0 ? formatEUR(r.total) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[color:var(--brand-green)] font-medium">
                        {auszahlung != null && auszahlung > 0
                          ? formatEUR(auszahlung)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[color:var(--border)] bg-[color:var(--surface)]">
                  <td className="px-4 py-2 font-medium">Summe</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {formatEUR(rows.reduce((s, r) => s + r.total, 0))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-[color:var(--brand-green)]">
                    {filterId && provisionByMitId.has(filterId)
                      ? formatEUR(
                          rows.reduce(
                            (s, r) => s + (payout(filterId, r.total) ?? 0),
                            0,
                          ),
                        )
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}
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
