"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { logRechnerEventAction } from "@/lib/actions";
import { formatEUR } from "@/lib/cashflow";
import type {
  CashDistribution,
  MonthlyCashflowPoint,
} from "@/lib/cashflow";
import type { MonthlySnapshot } from "@/lib/types";

export interface EmployeeOption {
  id: string;
  mitarbeiter_id: string;
  name: string;
  provision_pct: number | null;
  default_qualis: number | null;
  default_showup_rate: number | null;
  default_close_rate: number | null;
  default_avg_contract: number | null;
  derived_avg_contract: number | null;
  committed_series: MonthlyCashflowPoint[];
  cash_distribution: CashDistribution;
  monthly_snapshots: MonthlySnapshot[];
}

interface SliderProps {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  accent: "blue" | "green" | "orange" | "yellow";
}

const MONATE_LANG = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const WEEKS_PER_MONTH = 4;

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONATE_LANG[m - 1]} ${y}`;
}

function SliderRow(s: SliderProps) {
  const accentColor =
    s.accent === "blue"
      ? "var(--brand-blue)"
      : s.accent === "green"
      ? "var(--brand-green)"
      : s.accent === "orange"
      ? "var(--brand-orange)"
      : "var(--brand-yellow)";
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />
      <div className="pl-2">
        <div className="flex items-baseline justify-between mb-1">
          <label className="text-sm font-medium">{s.label}</label>
          <span className="text-xl font-semibold tabular-nums">
            {s.format ? s.format(s.value) : s.value}
            {s.unit ? ` ${s.unit}` : ""}
          </span>
        </div>
        <input
          type="range"
          min={s.min}
          max={s.max}
          step={s.step}
          value={s.value}
          onChange={(e) => s.onChange(Number(e.target.value))}
          className="w-full"
          style={{ accentColor }}
        />
        <div className="flex justify-between text-xs text-[color:var(--muted)] mt-1">
          <span>{s.format ? s.format(s.min) : s.min}{s.unit ? ` ${s.unit}` : ""}</span>
          {s.hint ? <span>{s.hint}</span> : null}
          <span>{s.format ? s.format(s.max) : s.max}{s.unit ? ` ${s.unit}` : ""}</span>
        </div>
      </div>
    </div>
  );
}

interface Baseline {
  qualis: number;
  showup: number;
  close: number;
  label: string;
  source: "current" | "snapshot" | "fallback";
}

const FALLBACK: Baseline = {
  qualis: 20,
  showup: 70,
  close: 30,
  label: "Fallback",
  source: "fallback",
};

function baselineFromSnapshot(s: MonthlySnapshot): Baseline {
  return {
    qualis: s.qualis,
    showup: s.showup_rate,
    close: s.close_rate,
    label: monthLabel(s.month),
    source: "snapshot",
  };
}

function baselineFromCurrent(e: EmployeeOption | undefined, currentMonth: string): Baseline {
  return {
    qualis: e?.default_qualis ?? FALLBACK.qualis,
    showup: e?.default_showup_rate ?? FALLBACK.showup,
    close: e?.default_close_rate ?? FALLBACK.close,
    label: `${monthLabel(currentMonth)} (aktuelle Werte)`,
    source: "current",
  };
}

export default function RechnerClient({
  employees,
  nowIso,
  teamAvgContract,
}: {
  employees: EmployeeOption[];
  nowIso: string;
  teamAvgContract: number;
}) {
  const [mode, setMode] = useState<"provision" | "umsatz">("provision");
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const employee = employees.find((e) => e.id === employeeId);

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const currentMonthKey = useMemo(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    [now],
  );

  // Snapshots are end-of-month data — only show completed months (everything before
  // the current month). Latest completed snapshot is the default baseline.
  const dataMonthOptions = useMemo(() => {
    const completed = (employee?.monthly_snapshots ?? [])
      .filter((s) => s.month < currentMonthKey)
      .sort((a, b) => b.month.localeCompare(a.month));
    if (completed.length === 0) {
      return [
        {
          value: "fallback",
          label: "Admin-Werte (keine historischen Snapshots)",
        },
      ];
    }
    return completed.map((s) => ({
      value: s.month,
      label:
        s.month === completed[0].month
          ? `${monthLabel(s.month)} (letzter abgeschlossener Monat)`
          : monthLabel(s.month),
    }));
  }, [employee, currentMonthKey]);

  const [dataMonth, setDataMonth] = useState(() => dataMonthOptions[0]?.value ?? "fallback");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    setDataMonth(dataMonthOptions[0]?.value ?? "fallback");
  }, [employeeId]);

  const baseline: Baseline = useMemo(() => {
    if (dataMonth === "fallback") return baselineFromCurrent(employee, currentMonthKey);
    const s = employee?.monthly_snapshots.find((x) => x.month === dataMonth);
    if (s) return baselineFromSnapshot(s);
    return baselineFromCurrent(employee, currentMonthKey);
  }, [dataMonth, employee, currentMonthKey]);

  const [qualis, setQualis] = useState(baseline.qualis);
  const [showup, setShowup] = useState(Math.round(baseline.showup));
  const [close, setClose] = useState(Math.round(baseline.close));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQualis(baseline.qualis);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowup(Math.round(baseline.showup));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClose(Math.round(baseline.close));
  }, [baseline]);

  // Provision-Mode → tatsächliche Provision des Mitarbeiters.
  // Umsatz-Mode → 100 % (zeigt Cashflow als Umsatz, nicht als Provision).
  const employeeProvision = employee?.provision_pct ?? 0;
  const provision = mode === "umsatz" ? 100 : employeeProvision;

  // Umsatz-Mode bevorzugt den Team-Ø-Vertragswert (HubSpot-Won-Deals der
  // Neukunden-Pipeline) als Referenz, sonst Fallback auf Mitarbeiter-Wert.
  const employeeAvgPrice =
    employee?.derived_avg_contract ?? employee?.default_avg_contract ?? 5000;
  const avgPrice =
    mode === "umsatz" && teamAvgContract > 0
      ? teamAvgContract
      : employeeAvgPrice;

  const distribution = employee?.cash_distribution.pct ?? [1];

  const currentMonthIndex = useMemo(() => {
    return employee?.committed_series.findIndex((p) => p.month === currentMonthKey) ?? -1;
  }, [employee, currentMonthKey]);

  const baselineRevenue =
    baseline.qualis * (baseline.showup / 100) * (baseline.close / 100) * avgPrice;
  const currentRevenue = qualis * (showup / 100) * (close / 100) * avgPrice;

  // Debounced Logging — schreibt nach 3 Sekunden Inaktivität ein Event in
  // rechner_events. Admin bekommt davon einmal täglich einen Digest gemailt.
  const skipFirstLog = useRef(true);
  useEffect(() => {
    if (!employee) return;
    if (skipFirstLog.current) {
      skipFirstLog.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const provPct = employee.provision_pct ?? 0;
      const expected =
        mode === "provision" ? currentRevenue * (provPct / 100) : currentRevenue;
      const fd = new FormData();
      fd.set("mode", mode);
      fd.set("qualis", String(qualis));
      fd.set("showup", String(showup));
      fd.set("close_rate", String(close));
      fd.set("avg_contract", String(avgPrice));
      fd.set("expected_value", String(expected));
      fd.set("data_month", dataMonth);
      logRechnerEventAction(fd).catch(() => {
        // Telemetry darf scheitern, ohne die UI zu blockieren.
      });
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    qualis,
    showup,
    close,
    avgPrice,
    dataMonth,
    employee?.id,
    currentRevenue,
  ]);
  // One-shot: how much extra revenue would have been generated THIS month if you had
  // performed at the slider levels instead of the baseline. Distributes over the
  // following months according to the historical cash distribution.
  const additionalRevenueOneShot = Math.max(0, currentRevenue - baselineRevenue);

  const timeline = useMemo(() => {
    if (!employee) return [];
    const rows = employee.committed_series.map((p) => ({
      ...p,
      projected: 0,
      cashflow: p.cashflow,
      auszahlung: 0,
    }));
    if (additionalRevenueOneShot > 0 && currentMonthIndex >= 0) {
      // ONE close month (the current one) generates extra closures; the cash from those
      // closures is distributed over the following months per the historical pattern.
      for (let offset = 0; offset < distribution.length; offset++) {
        const targetIdx = currentMonthIndex + offset;
        if (targetIdx >= rows.length) break;
        rows[targetIdx].projected += additionalRevenueOneShot * distribution[offset];
      }
    }
    for (const r of rows) {
      r.cashflow = r.cashflow + r.projected;
      r.auszahlung = r.cashflow * (provision / 100);
    }
    return rows;
  }, [employee, additionalRevenueOneShot, currentMonthIndex, distribution, provision]);

  const yearEndIndex = getYearEndIndex(timeline, nowIso);
  const startFutureIdx = currentMonthIndex >= 0 ? currentMonthIndex : 0;
  const currentYear = now.getFullYear();
  const ytdPast = timeline
    .filter((p) => p.isPast)
    .reduce((s, p) => s + p.auszahlung, 0);

  const restThisMonth = timeline[currentMonthIndex]?.auszahlung ?? 0;
  const restThisMonthBase =
    ((timeline[currentMonthIndex]?.cashflow ?? 0) -
      (timeline[currentMonthIndex]?.projected ?? 0)) *
    (provision / 100);
  const thisMonthDelta = restThisMonth - restThisMonthBase;

  const fullYearWithAdjustment =
    ytdPast +
    timeline
      .slice(startFutureIdx, yearEndIndex + 1)
      .reduce((s, p) => s + p.auszahlung, 0);
  const fullYearBase =
    ytdPast +
    timeline
      .slice(startFutureIdx, yearEndIndex + 1)
      .reduce((s, p) => s + (p.cashflow - p.projected) * (provision / 100), 0);
  const fullYearDelta = fullYearWithAdjustment - fullYearBase;

  function reset() {
    setQualis(baseline.qualis);
    setShowup(baseline.showup);
    setClose(baseline.close);
  }

  const showups = qualis * (showup / 100);
  const abschluesse = showups * (close / 100);
  const baselineShowups = baseline.qualis * (baseline.showup / 100);
  const baselineAbschluesse = baselineShowups * (baseline.close / 100);
  const extraAbschluesse = Math.max(0, abschluesse - baselineAbschluesse);

  const umsatzDisabled = teamAvgContract <= 0;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)] mb-2">
          Was möchtest du berechnen?
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="rechner-mode"
              value="provision"
              checked={mode === "provision"}
              onChange={() => setMode("provision")}
              className="accent-[color:var(--brand-blue)]"
            />
            <span className="text-sm font-medium">Eigene Provision</span>
          </label>
          <label className={`flex items-center gap-2 ${umsatzDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
            <input
              type="radio"
              name="rechner-mode"
              value="umsatz"
              checked={mode === "umsatz"}
              disabled={umsatzDisabled}
              onChange={() => setMode("umsatz")}
              className="accent-[color:var(--brand-blue)]"
            />
            <span className="text-sm">
              <span className="font-medium">Möglicher Umsatz</span>
              <span className="text-[color:var(--muted)] ml-1">
                {umsatzDisabled
                  ? "(noch kein Ø-Vertragswert)"
                  : `(Ø ${formatEUR(teamAvgContract)})`}
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-48">
          <label className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
            Mitarbeiter
          </label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="mt-1 block w-full border border-[color:var(--border)] rounded px-3 py-2 text-sm bg-white"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
            Datengrundlage
          </label>
          <select
            value={dataMonth}
            onChange={(e) => setDataMonth(e.target.value)}
            disabled={dataMonthOptions.length === 1}
            className="mt-1 block w-full border border-[color:var(--border)] rounded px-3 py-2 text-sm bg-white disabled:opacity-60"
          >
            {dataMonthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {dataMonthOptions.length === 1 ? (
            <div className="text-[11px] text-[color:var(--muted)] mt-1">
              Sobald weitere abgeschlossene Monate per HubSpot eingespielt sind, kannst du hier andere Monate als Ausgangslage wählen.
            </div>
          ) : (
            <div className="text-[11px] text-[color:var(--muted)] mt-1">
              Nur abgeschlossene Monate. Der laufende Monat ({monthLabel(currentMonthKey)}) hat noch kein Monatsende-Snapshot.
            </div>
          )}
        </div>
        <button
          onClick={reset}
          className="text-sm px-4 py-2 rounded bg-[color:var(--brand-blue)] text-white font-medium hover:opacity-90 self-end"
        >
          Auf Ausgangswerte zurücksetzen
        </button>
      </div>

      <div className="bg-[color:var(--brand-yellow)]/20 border border-[color:var(--brand-yellow)] rounded-lg px-4 py-2 text-xs">
        <strong>Ausgangslage:</strong> {baseline.label} —{" "}
        {baseline.qualis} Qualis · {Math.round(baseline.showup)} % Showup · {Math.round(baseline.close)} % Closing.
        Stell dir vor: <strong>diesen Monat</strong> hättest du an einem der Slider
        gedreht. Was hätte das gebracht? Der Effekt verteilt sich auf die
        Folgemonate, ist aber <strong>einmalig</strong> — nicht jeden Monat aufs Neue.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SliderRow
          label="Qualis vereinbart / Woche"
          min={0}
          max={Math.ceil(300 / WEEKS_PER_MONTH)}
          step={1}
          value={Math.round(qualis / WEEKS_PER_MONTH)}
          onChange={(weekly) => setQualis(weekly * WEEKS_PER_MONTH)}
          accent="blue"
        />
        <SliderRow
          label="Showup-Rate"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={Math.round(showup)}
          onChange={(v) => setShowup(Math.round(v))}
          format={(v) => Math.round(v).toString()}
          accent="orange"
        />
        <SliderRow
          label="Closing-Rate"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={Math.round(close)}
          onChange={(v) => setClose(Math.round(v))}
          format={(v) => Math.round(v).toString()}
          accent="green"
        />
      </div>

      <div className="bg-[color:var(--brand-grey)]/40 border border-[color:var(--border)] rounded-lg px-4 py-3">
        <div className="text-xs text-[color:var(--muted)] mb-2">
          Funnel pro Monat (mit deinen Slidern):
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FunnelStep
            label="Qualis vereinbart"
            value={qualis.toLocaleString("de-AT", { maximumFractionDigits: 1 })}
            sub={
              qualis !== baseline.qualis
                ? `${qualis > baseline.qualis ? "+" : ""}${qualis - baseline.qualis} ggü. Ausgangslage`
                : "= Ausgangslage"
            }
            accent="blue"
          />
          <FunnelStep
            label="Showups"
            value={showups.toLocaleString("de-AT", { maximumFractionDigits: 1 })}
            sub={`${showup} % erscheinen`}
            accent="orange"
          />
          <FunnelStep
            label="Abschlüsse (zusätzlich)"
            value={`+ ${extraAbschluesse.toLocaleString("de-AT", { maximumFractionDigits: 1 })}`}
            sub={
              extraAbschluesse > 0
                ? `aus den extra Qualis/Quote diesen Monat`
                : "Bei Ausgangslage = 0"
            }
            accent="green"
          />
          <FunnelStep
            label="Zusätzlicher Cashflow (einmalig)"
            value={formatEUR(additionalRevenueOneShot)}
            sub={
              additionalRevenueOneShot > 0
                ? `Ø Verkaufspreis ${formatEUR(avgPrice)} · verteilt auf Folgemonate`
                : "Bei Ausgangslage = € 0"
            }
            accent="yellow"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ResultCard
          label="Effekt deines „Was wäre wenn"
          value={`+ ${formatEUR(additionalRevenueOneShot * (provision / 100))}`}
          sub={
            additionalRevenueOneShot > 0
              ? mode === "umsatz"
                ? "Einmaliger Mehr-Umsatz, verteilt auf Folgemonate"
                : "Einmalige Mehr-Auszahlung, verteilt auf Folgemonate"
              : "Slider auf Ausgangslage — kein Effekt"
          }
          tone="highlight"
        />
        <ResultCard
          label={`${mode === "umsatz" ? "Umsatz" : "Auszahlung"} ${monthLabel(currentMonthKey).split(" ")[0]} ${currentYear}`}
          value={formatEUR(restThisMonth)}
          sub={
            thisMonthDelta > 0
              ? `Basis ${formatEUR(restThisMonthBase)} + ${formatEUR(thisMonthDelta)} durch Adjustment`
              : `Basis ${formatEUR(restThisMonthBase)} (kein Adjustment)`
          }
          tone="future"
        />
        <ResultCard
          label={`${mode === "umsatz" ? "Umsatz" : "Provision"} ${currentYear}`}
          value={formatEUR(fullYearWithAdjustment)}
          sub={
            fullYearDelta > 0
              ? `Ohne Adjustment ${formatEUR(fullYearBase)} → + ${formatEUR(fullYearDelta)}`
              : `Ohne Adjustment ${formatEUR(fullYearBase)} (kein Adjustment)`
          }
          tone="future"
        />
      </div>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <h2 className="font-semibold">Monatsübersicht</h2>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Vergangenheit = grau (fix). Aktuell + Zukunft = grün (Slider-getrieben).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Monat</th>
                <th className="px-4 py-2 font-medium text-right">Bestehend (Raten)</th>
                <th className="px-4 py-2 font-medium text-right">Neu</th>
                <th className="px-4 py-2 font-medium text-right">Cashflow</th>
                <th className="px-4 py-2 font-medium text-right">
                  {mode === "umsatz" ? "Umsatz" : "Auszahlung"}
                </th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((p, i) => (
                <tr
                  key={p.month}
                  className={`border-t border-[color:var(--border)] ${
                    p.isPast
                      ? "text-[color:var(--muted)] bg-[color:var(--surface)]/40"
                      : i === currentMonthIndex
                      ? "bg-[color:var(--brand-yellow)]/15"
                      : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    {p.monthLabel}
                    {p.isPast ? (
                      <span className="ml-2 text-xs text-[color:var(--muted)]">(fix)</span>
                    ) : i === currentMonthIndex ? (
                      <span className="ml-2 text-xs text-[color:var(--brand-orange)] font-medium">(heute)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.cashflow > p.projected ? formatEUR(p.cashflow - p.projected) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.projected > 0 ? (
                      <span className="text-[color:var(--brand-blue)]">+ {formatEUR(p.projected)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {p.cashflow > 0 ? formatEUR(p.cashflow) : "—"}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${p.isPast ? "" : "text-[color:var(--brand-green)]"}`}>
                    {p.auszahlung > 0 ? formatEUR(p.auszahlung) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[color:var(--border)] bg-[color:var(--surface)] font-semibold">
                <td className="px-4 py-2">Summe</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatEUR(timeline.reduce((s, p) => s + (p.cashflow - p.projected), 0))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[color:var(--brand-blue)]">
                  + {formatEUR(timeline.reduce((s, p) => s + p.projected, 0))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatEUR(timeline.reduce((s, p) => s + p.cashflow, 0))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[color:var(--brand-green)]">
                  {formatEUR(timeline.reduce((s, p) => s + p.auszahlung, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function getYearEndIndex(timeline: { month: string }[], nowIso: string): number {
  const year = new Date(nowIso).getFullYear();
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].month.startsWith(`${year}-`)) return i;
  }
  return timeline.length - 1;
}

function FunnelStep({
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
    <div className="bg-white border border-[color:var(--border)] rounded-lg p-3 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />
      <div className="pl-2">
        <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">{label}</div>
        <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
        {sub ? <div className="text-[11px] text-[color:var(--muted)]">{sub}</div> : null}
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "locked" | "future" | "highlight";
}) {
  const config = {
    locked: { bg: "bg-white", border: "border border-[color:var(--border)]", bar: "var(--brand-grey)", valueColor: "text-[color:var(--muted)]" },
    future: { bg: "bg-white", border: "border border-[color:var(--brand-green)]", bar: "var(--brand-green)", valueColor: "text-[color:var(--brand-green)]" },
    highlight: { bg: "bg-[color:var(--brand-green)]/10", border: "border-2 border-[color:var(--brand-green)]", bar: "var(--brand-green)", valueColor: "text-[color:var(--brand-green)]" },
  }[tone];
  return (
    <div className={`rounded-lg p-5 relative overflow-hidden ${config.bg} ${config.border}`}>
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: config.bar }} />
      <div className="pl-2">
        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">{label}</div>
        <div className={`text-3xl font-semibold mt-1 tabular-nums ${config.valueColor}`}>{value}</div>
        {sub ? <div className="text-xs text-[color:var(--muted)] mt-1">{sub}</div> : null}
      </div>
    </div>
  );
}
