import Link from "next/link";
import CashflowChart from "@/components/CashflowChart";
import MitarbeiterFilter from "@/components/MitarbeiterFilter";
import YearFilter from "@/components/YearFilter";
import {
  buildCashflow,
  expandPayments,
  formatEUR,
  outstandingByMitarbeiter,
} from "@/lib/cashflow";
import { SETTER_TARIFFS } from "@/lib/setter-tiers";
import { listDeals, listEmployees } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mitarbeiter?: string; year?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const { mitarbeiter: filterIdRaw, year: yearRaw } = await searchParams;
  // Members can only see their own cashflow; ignore any filter override.
  const filterId = ctx.isAdmin ? filterIdRaw : ctx.ownerId;
  const [allDeals, employees] = await Promise.all([listDeals(), listEmployees()]);

  // Verfügbare Jahre aus tatsächlichen Zahlungs-Daten zusammenstellen, plus
  // aktuelles und nächstes Jahr (damit der Filter immer im Voraus verfügbar ist).
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
  // Monatliches Fixum: Summe aus zwei Quellen, beide optional.
  //   1) setter_hours → Setter-Tarif-Fixum (20h = 900 €, …)
  //   2) closer_fixum_eur → frei eintragbares Closer-Fixum aus dem Admin
  // Werden addiert, falls beide gesetzt sind (z.B. wenn jemand sowohl Setter
  // als auch Closer ist). Zusätzlich pro Mitarbeiter Start/Ende des
  // Dienstverhältnisses speichern, damit Fixum außerhalb dieses Zeitraums
  // unterdrückt wird.
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
  // Fixum für einen bestimmten Mitarbeiter und Monat: nur wenn der Monat
  // innerhalb des Dienstverhältnisses liegt. Vergleich geschieht auf
  // Monatsebene (Jän = "2026-01" vs. employment_end-Monat).
  const monthlyFixFor = (mitId: string, monthKey: string): number => {
    const fix = fixumByMitId.get(mitId) ?? 0;
    if (fix <= 0) return 0;
    const start = employmentStartByMitId.get(mitId);
    if (start && monthKey < start.slice(0, 7)) return 0;
    const end = employmentEndByMitId.get(mitId);
    if (end && monthKey > end.slice(0, 7)) return 0;
    return fix;
  };
  // Variable Auszahlung (Provision × Cashflow). Wird bei den
  // Ausständig-Tiles verwendet, weil dort die Gesamt-Restprovision
  // gezeigt wird — Fixum hat dort keine Bedeutung (das läuft monatlich,
  // nicht pro offener Rate).
  const payout = (mitId: string, amount: number) => {
    const p = provisionByMitId.get(mitId);
    return p == null ? null : (amount * p) / 100;
  };
  // Fixum wird 14× pro Jahr ausgezahlt: Juni und November doppelt
  // (Urlaubsgeld + Weihnachtsgeld).
  const fixumPaymentsInMonth = (monthOneBased: number): number =>
    monthOneBased === 6 || monthOneBased === 11 ? 2 : 1;
  const monthFromKey = (key: string): number => {
    const parts = key.split("-");
    return Number.parseInt(parts[1] ?? "0", 10);
  };
  // Monatsauszahlung = variabel + (Fixum × Anzahl Auszahlungen in dem Monat).
  // null nur, wenn beides fehlt.
  const monthlyPayout = (mitId: string, amount: number, monthKey: string) => {
    const p = provisionByMitId.get(mitId);
    const fix = monthlyFixFor(mitId, monthKey);
    if (p == null && fix === 0) return null;
    const variable = p != null ? (amount * p) / 100 : 0;
    const fixCount = fixumPaymentsInMonth(monthFromKey(monthKey));
    return variable + fix * fixCount;
  };

  const filteredDeals = filterId
    ? allDeals.filter((d) => d.mitarbeiter_id === filterId)
    : allDeals;

  // Ab Januar des gewählten Jahres rendern — vergangene Monate des Jahres sind
  // damit sichtbar; zukünftige Monate (auch über das Jahresende hinaus) folgen
  // wie zuvor aus den expandierten Ratenzahlungen.
  const yearStart = new Date(selectedYear, 0, 1);
  const { mitarbeiter, rows } = buildCashflow(filteredDeals, { from: yearStart });
  const dealCount = filteredDeals.filter((d) => !d.pending_delete).length;
  // Anzeige-Cashflow:
  //   Admins sehen die Original-Beträge aus HubSpot (Company-True-Cashflow);
  //   Members sehen ihre eigenen, ggf. angepassten betrag-Werte.
  // Auszahlungs-/Provisionsrechnung verwendet weiterhin den
  // Provisions-relevanten `betrag` (r.total / r.byMitarbeiter).
  const displayTotal = (r: (typeof rows)[number]): number =>
    ctx.isAdmin ? r.totalOriginal : r.total;
  const displayByMit = (
    r: (typeof rows)[number],
    mitId: string,
  ): number =>
    ctx.isAdmin
      ? r.byMitarbeiterOriginal[mitId] ?? 0
      : r.byMitarbeiter[mitId] ?? 0;
  // Stärkster Monat = höchste Auszahlung (variabel + Fixum, je nach Filter).
  // Bei "Alle": Summe der Auszahlungen über alle Mitarbeiter im Monat;
  // bei Einzelfilter: Auszahlung des gewählten Mitarbeiters.
  const computeRowPayout = (r: (typeof rows)[number]): number => {
    if (filterId)
      return monthlyPayout(filterId, r.byMitarbeiter[filterId] ?? r.total, r.month) ?? 0;
    let sum = 0;
    for (const [mitId, amount] of Object.entries(r.byMitarbeiter)) {
      sum += monthlyPayout(mitId, amount, r.month) ?? 0;
    }
    return sum;
  };
  const peakRow = rows.reduce(
    (a, b) => (computeRowPayout(b) > computeRowPayout(a) ? b : a),
    rows[0] ?? {
      total: 0,
      monthLabel: "—",
      month: "",
      byMitarbeiter: {},
      totalOriginal: 0,
      byMitarbeiterOriginal: {},
    },
  );
  const peakPayout = computeRowPayout(peakRow);

  // Jahresverdienst des gewählten Mitarbeiters im gewählten Kalenderjahr.
  // Wird oben als KPI-Tile gezeigt, wenn ein Mitarbeiter-Filter aktiv ist.
  const yearEarnings = (() => {
    if (!filterId) return null;
    const yearRows = rows.filter((r) => r.month.startsWith(`${selectedYear}-`));
    const variable = yearRows.reduce(
      (s, r) => s + (payout(filterId, r.total) ?? 0),
      0,
    );
    let fixSum = 0;
    let fixCount = 0;
    let fixRef = 0;
    for (const r of yearRows) {
      const fix = monthlyFixFor(filterId, r.month);
      if (fix > 0) {
        const cnt = fixumPaymentsInMonth(monthFromKey(r.month));
        fixCount += cnt;
        fixSum += fix * cnt;
        fixRef = fix;
      }
    }
    return { variable, fixSum, fixCount, fixRef, total: variable + fixSum };
  })();

  const palette = ["#449dd7", "#53b684", "#f28a26", "#ffd857", "#6b7280"];
  const currentName = filterId
    ? allMitarbeiter.find((m) => m.id === filterId)?.name ??
      (filterId === ctx.ownerId ? ctx.employee.name : "Unbekannt")
    : null;

  const outstandingAll = outstandingByMitarbeiter(allDeals);
  // Admin sieht Original-Beträge (Company-True-Cashflow). Members sehen ihren
  // Provisions-relevanten Betrag — Original ist für sie ohnehin nicht sichtbar.
  const outstandingDisplayTotal = (r: (typeof outstandingAll)[number]): number =>
    ctx.isAdmin ? r.totalOriginal : r.total;
  const outstandingTotal = outstandingAll.reduce((s, r) => s + r.total, 0);
  const outstandingDisplayTotalSum = outstandingAll.reduce(
    (s, r) => s + outstandingDisplayTotal(r),
    0,
  );
  const currentOutstanding = filterId
    ? outstandingAll.find((r) => r.mitarbeiter_id === filterId)
    : null;
  // Auszahlungsbasis: variable Provision auf den ausstehenden Cashflow.
  // Fixum bleibt hier außen vor, weil es ein monatliches Grundgehalt ist —
  // keine "offene Rate" im Receivable-Sinne.
  const outstandingPayoutTotal = outstandingAll.reduce(
    (s, r) => s + (payout(r.mitarbeiter_id, r.total) ?? 0),
    0,
  );
  const currentOutstandingPayout = currentOutstanding
    ? payout(currentOutstanding.mitarbeiter_id, currentOutstanding.total)
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
        <div className="flex flex-wrap items-center gap-2">
          <YearFilter years={availableYears} current={selectedYear} />
          {ctx.isAdmin ? (
            <MitarbeiterFilter
              mitarbeiter={allMitarbeiter}
              current={filterId ?? null}
            />
          ) : null}
        </div>
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${
          yearEarnings ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        <KpiCard label="Aktive Deals" value={String(dealCount)} accent="blue" />
        <KpiCard
          label={currentName ? "Ausständig (ab heute)" : "Ausständig gesamt (ab heute)"}
          value={formatEUR(
            currentOutstanding
              ? currentOutstandingPayout ?? currentOutstanding.total
              : outstandingPayoutTotal || outstandingDisplayTotalSum,
          )}
          sub={`${
            currentOutstanding
              ? currentOutstanding.openPayments
              : outstandingAll.reduce((s, r) => s + r.openPayments, 0)
          } offene Raten · Cashflow ${formatEUR(
            currentOutstanding
              ? outstandingDisplayTotal(currentOutstanding)
              : outstandingDisplayTotalSum,
          )}`}
          accent="yellow"
        />
        <KpiCard
          label="Stärkster Monat"
          value={formatEUR(peakPayout > 0 ? peakPayout : displayTotal(peakRow))}
          sub={`${peakRow.monthLabel}${
            peakPayout > 0 && peakPayout !== displayTotal(peakRow)
              ? ` · Cashflow ${formatEUR(displayTotal(peakRow))}`
              : ""
          }`}
          accent="orange"
        />
        {yearEarnings && yearEarnings.total > 0 ? (
          <KpiCard
            label={`Jahresverdienst ${selectedYear}`}
            value={formatEUR(yearEarnings.total)}
            sub={`${formatEUR(yearEarnings.variable)} Provision${
              yearEarnings.fixSum > 0
                ? ` + ${formatEUR(yearEarnings.fixSum)} Fixum (${yearEarnings.fixCount}×)`
                : ""
            }`}
            accent="green"
          />
        ) : null}
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
                  <div className="text-lg font-semibold tabular-nums mt-1 pl-2 text-[color:var(--brand-green)]">
                    {formatEUR(auszahlung ?? r.total)}
                  </div>
                  <div className="text-xs text-[color:var(--muted)] mt-1 pl-2 tabular-nums">
                    Cashflow {formatEUR(outstandingDisplayTotal(r))}
                  </div>
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
          data={rows.map((r) => ({ monthLabel: r.monthLabel, total: displayTotal(r) }))}
          nowIndex={rows.findIndex(
            (r) =>
              r.month ===
              `${new Date().getFullYear()}-${String(
                new Date().getMonth() + 1,
              ).padStart(2, "0")}`,
          )}
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
                      {displayTotal(r) > 0 ? formatEUR(displayTotal(r)) : "—"}
                    </td>
                    {mitarbeiter.map((m) => (
                      <td
                        key={m.id}
                        className="px-4 py-2 text-right tabular-nums text-[color:var(--muted)]"
                      >
                        {displayByMit(r, m.id) > 0
                          ? formatEUR(displayByMit(r, m.id))
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
          <div className="px-4 py-3 border-b border-[color:var(--border)] flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold">Monatsübersicht · {currentName}</h2>
            {filterId
              ? (() => {
                  const yearRows = rows.filter((r) =>
                    r.month.startsWith(`${selectedYear}-`),
                  );
                  const variableTotal = yearRows.reduce(
                    (s, r) => s + (payout(filterId, r.total) ?? 0),
                    0,
                  );
                  // Pro Monat Fixum nur wenn innerhalb des Dienstverhältnisses.
                  let fixumTotal = 0;
                  let fixCountTotal = 0;
                  let monthlyFixRef = 0;
                  for (const r of yearRows) {
                    const fix = monthlyFixFor(filterId, r.month);
                    if (fix > 0) {
                      const cnt = fixumPaymentsInMonth(monthFromKey(r.month));
                      fixCountTotal += cnt;
                      fixumTotal += fix * cnt;
                      monthlyFixRef = fix;
                    }
                  }
                  const yearTotal = variableTotal + fixumTotal;
                  return yearTotal > 0 ? (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                        Jahresverdienst {selectedYear}
                      </div>
                      <div className="text-lg font-semibold tabular-nums text-[color:var(--brand-green)]">
                        {formatEUR(yearTotal)}
                      </div>
                      <div className="text-xs text-[color:var(--muted)] tabular-nums">
                        {formatEUR(variableTotal)} Provision
                        {fixumTotal > 0
                          ? ` + ${formatEUR(fixumTotal)} Fixum (${fixCountTotal}× ${formatEUR(monthlyFixRef)} · Jun/Nov doppelt)`
                          : ""}
                      </div>
                    </div>
                  ) : null;
                })()
              : null}
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
                  const variable = filterId ? payout(filterId, r.total) ?? 0 : 0;
                  const monthlyFix = filterId ? monthlyFixFor(filterId, r.month) : 0;
                  const fixCount = fixumPaymentsInMonth(monthFromKey(r.month));
                  const fixum = monthlyFix * fixCount;
                  const total = variable + fixum;
                  const doubleFix = fixCount === 2 && monthlyFix > 0;
                  return (
                    <tr
                      key={r.month}
                      className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                    >
                      <td className="px-4 py-2">{r.monthLabel}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {displayTotal(r) > 0 ? formatEUR(displayTotal(r)) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[color:var(--brand-green)] font-medium">
                        {total > 0 ? (
                          <>
                            {formatEUR(total)}
                            {fixum > 0 && variable > 0 ? (
                              <span className="ml-1 text-xs text-[color:var(--muted)] font-normal">
                                ({formatEUR(variable)} + {doubleFix ? `2× ${formatEUR(monthlyFix)}` : formatEUR(monthlyFix)} fix)
                              </span>
                            ) : fixum > 0 ? (
                              <span className="ml-1 text-xs text-[color:var(--muted)] font-normal">
                                ({doubleFix ? `2× ${formatEUR(monthlyFix)}` : formatEUR(monthlyFix)} fix)
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  // Effektive Anzahl Fixum-Auszahlungen über den
                  // angezeigten Zeitraum, unter Berücksichtigung von
                  // Start/Ende Dienstverhältnis.
                  let totalFixCount = 0;
                  let monthlyFixRef = 0;
                  if (filterId) {
                    for (const r of rows) {
                      const fix = monthlyFixFor(filterId, r.month);
                      if (fix > 0) {
                        totalFixCount += fixumPaymentsInMonth(monthFromKey(r.month));
                        monthlyFixRef = fix;
                      }
                    }
                  }
                  return (
                    <tr className="border-t-2 border-[color:var(--border)] bg-[color:var(--surface)]">
                      <td className="px-4 py-2 font-medium">
                        Summe
                        {totalFixCount > 0 ? (
                          <span className="text-xs text-[color:var(--muted)] font-normal ml-2">
                            (inkl. {formatEUR(monthlyFixRef)} Fixum × {totalFixCount}{" "}
                            Auszahlungen · Jun/Nov doppelt)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">
                        {formatEUR(rows.reduce((s, r) => s + displayTotal(r), 0))}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-[color:var(--brand-green)]">
                        {filterId &&
                        (provisionByMitId.has(filterId) || totalFixCount > 0)
                          ? formatEUR(
                              rows.reduce(
                                (s, r) =>
                                  s + (monthlyPayout(filterId, r.total, r.month) ?? 0),
                                0,
                              ),
                            )
                          : "—"}
                      </td>
                    </tr>
                  );
                })()}
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
