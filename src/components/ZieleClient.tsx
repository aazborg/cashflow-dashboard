"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEUR } from "@/lib/cashflow";
import { INTERVALL_MONATE, type Intervall } from "@/lib/types";

export interface ProductOption {
  id: string;
  name: string;
  price: number;
  default_anzahl_raten: number | null;
  default_intervall: Intervall | null;
  is_upsell: boolean;
}

export interface TeamBaseline {
  members_total: number;
  members_with_snapshot: number;
  members_fallback: number;
  qualis_per_member: number;
  showup_rate: number;
  close_rate: number;
  avg_contract_value: number;
  source: "snapshots" | "mixed" | "defaults";
}

const WEEKS_PER_MONTH = 4;

interface SliderProps {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  disabled?: boolean;
  accent: "blue" | "green" | "orange" | "yellow";
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
    <div className={`bg-white border border-[color:var(--border)] rounded-lg p-4 relative overflow-hidden ${s.disabled ? "opacity-75" : ""}`}>
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />
      <div className="pl-2">
        <div className="flex items-baseline justify-between mb-1">
          <label className="text-sm font-medium">{s.label}</label>
          <span className="text-xl font-semibold tabular-nums">
            {s.value.toLocaleString("de-AT", { maximumFractionDigits: 1 })}
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
          disabled={s.disabled}
          className="w-full"
          style={{ accentColor }}
        />
        <div className="flex justify-between text-xs text-[color:var(--muted)] mt-1">
          <span>{s.min}{s.unit ? ` ${s.unit}` : ""}</span>
          {s.hint ? <span>{s.hint}</span> : null}
          <span>{s.max}{s.unit ? ` ${s.unit}` : ""}</span>
        </div>
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
  tone: "primary" | "neutral" | "highlight";
}) {
  const config = {
    neutral: { bg: "bg-white", border: "border border-[color:var(--border)]", bar: "var(--brand-grey)", valueColor: "text-[color:var(--foreground)]" },
    primary: { bg: "bg-white", border: "border border-[color:var(--brand-blue)]", bar: "var(--brand-blue)", valueColor: "text-[color:var(--brand-blue)]" },
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

function ProductTable({
  title,
  subtitle,
  products,
  quantities,
  setQty,
  summeStk,
  summeRevenue,
  showStkSumme,
  accent = "green",
}: {
  title: string;
  subtitle: string;
  products: ProductOption[];
  quantities: Record<string, number>;
  setQty: (id: string, v: number) => void;
  summeStk: number;
  summeRevenue: number;
  showStkSumme: boolean;
  accent?: "green" | "blue";
}) {
  const summeColor =
    accent === "blue" ? "text-[color:var(--brand-blue)]" : "text-[color:var(--brand-green)]";
  return (
    <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[color:var(--border)]">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-[color:var(--muted)] mt-1">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)] text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Produkt</th>
              <th className="px-3 py-2 font-medium text-right">Preis</th>
              <th className="px-3 py-2 font-medium text-right">Stk/Monat</th>
              <th className="px-3 py-2 font-medium text-right">Umsatz/Monat</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const qty = quantities[p.id] ?? 0;
              const rev = qty * p.price;
              return (
                <tr key={p.id} className="border-t border-[color:var(--border)]">
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(p.price)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={qty || ""}
                      placeholder="0"
                      onChange={(e) => setQty(p.id, Number(e.target.value))}
                      className="border border-[color:var(--border)] rounded px-2 py-1 w-20 text-right tabular-nums bg-white"
                    />
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${rev > 0 ? "font-medium" : "text-[color:var(--muted)]"}`}>
                    {rev > 0 ? formatEUR(rev) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[color:var(--border)] bg-[color:var(--surface)] font-semibold">
              <td className="px-3 py-2" colSpan={2}>Summe</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {showStkSumme ? summeStk : "—"}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${summeColor}`}>
                {formatEUR(summeRevenue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

const MONATE_KURZ = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export default function ZieleClient({
  products,
  baseline,
}: {
  products: ProductOption[];
  baseline: TeamBaseline;
}) {
  // Default ist die Planung über den Ø-Vertragswert. Wer nach Produkten
  // planen will, klickt das Häkchen unten an.
  const [useAvgContract, setUseAvgContract] = useState(
    baseline.avg_contract_value > 0,
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [avgQualisPerWeek, setAvgQualisPerWeek] = useState(0);
  const [showup, setShowup] = useState(baseline.showup_rate);
  const [close, setClose] = useState(baseline.close_rate);

  function setQty(id: string, v: number) {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.round(v || 0)) }));
  }

  function reset() {
    setQuantities({});
    setAvgQualisPerWeek(0);
    setShowup(baseline.showup_rate);
    setClose(baseline.close_rate);
  }

  // Im avg-Mode aus Qualis/Woche × Showup × Close ableiten.
  const avgQualisPerMonth = avgQualisPerWeek * WEEKS_PER_MONTH;
  const avgAbschluesseTotal =
    avgQualisPerMonth * (showup / 100) * (close / 100);
  const computedUmsatz = avgAbschluesseTotal * baseline.avg_contract_value;

  // Zielumsatz-Input (bidirektional gekoppelt mit Qualis-Slider).
  // Bei Slider/Showup/Close-Änderung wird der Input neu befüllt; beim
  // Tippen bleibt der Wert wie eingegeben, bis blur/Enter den Slider
  // zurückrechnet.
  const [zielumsatzInput, setZielumsatzInput] = useState<string>("0");
  useEffect(() => {
    setZielumsatzInput(Math.round(computedUmsatz).toString());
  }, [computedUmsatz]);

  function commitZielumsatz() {
    const numeric = Number(zielumsatzInput.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!Number.isFinite(numeric) || numeric < 0) {
      setZielumsatzInput(Math.round(computedUmsatz).toString());
      return;
    }
    const ratioPerWeek =
      WEEKS_PER_MONTH * (showup / 100) * (close / 100) * baseline.avg_contract_value;
    if (ratioPerWeek <= 0) return;
    setAvgQualisPerWeek(Math.max(0, Math.round(numeric / ratioPerWeek)));
  }

  const productLineItems = useMemo(
    () =>
      products
        .map((p) => {
          const qty = quantities[p.id] ?? 0;
          return { product: p, qty, revenue: qty * p.price };
        })
        .filter((x) => x.qty > 0),
    [products, quantities],
  );

  const abschlussItems = productLineItems.filter((x) => !x.product.is_upsell);
  const upsellItems = productLineItems.filter((x) => x.product.is_upsell);

  const abschluesseTotal = useAvgContract
    ? avgAbschluesseTotal
    : abschlussItems.reduce((s, x) => s + x.qty, 0);
  const umsatzAbschluss = useAvgContract
    ? avgAbschluesseTotal * baseline.avg_contract_value
    : abschlussItems.reduce((s, x) => s + x.revenue, 0);
  const umsatzUpsell = useAvgContract
    ? 0
    : upsellItems.reduce((s, x) => s + x.revenue, 0);
  const umsatzTotal = umsatzAbschluss + umsatzUpsell;
  const avgDealSize = useAvgContract
    ? baseline.avg_contract_value
    : abschluesseTotal > 0
    ? umsatzAbschluss / abschluesseTotal
    : 0;

  const closeRate = close / 100;
  const showupRate = showup / 100;
  const showupsNeeded = closeRate > 0 ? abschluesseTotal / closeRate : 0;
  const qualisNeeded = showupRate > 0 ? showupsNeeded / showupRate : 0;
  const qualisPerMemberNeeded =
    baseline.members_total > 0 ? qualisNeeded / baseline.members_total : 0;

  // Cashflow projection over 24 months from the start of the current month,
  // assuming the monthly target is hit every month going forward.
  const cashflowSeries = useMemo(() => {
    const horizon = 24;
    const series: { month: string; label: string; cashflow: number }[] = [];
    const now = new Date();
    for (let i = 0; i < horizon; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      series.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${MONATE_KURZ[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        cashflow: 0,
      });
    }
    if (useAvgContract) {
      // Mit dem Ø-Vertragswert: behandeln wir jeden Abschluss als Einmalzahlung
      // im Monat des Abschlusses (keine Raten-Verteilung bekannt).
      const monthly = avgAbschluesseTotal * baseline.avg_contract_value;
      for (let i = 0; i < horizon; i++) series[i].cashflow += monthly;
      return series;
    }
    for (const item of productLineItems) {
      const raten = item.product.default_anzahl_raten ?? 1;
      const intervall = item.product.default_intervall ?? "Einmalzahlung";
      const intervalMonths = INTERVALL_MONATE[intervall];
      const ratenBetrag = item.product.price / raten;
      // For each month in the horizon: a new cohort of `qty` deals starts.
      // Each deal contributes `ratenBetrag` for `raten` payments at `intervalMonths` cadence.
      for (let cohort = 0; cohort < horizon; cohort++) {
        for (let r = 0; r < raten; r++) {
          const idx = cohort + r * intervalMonths;
          if (idx >= horizon) break;
          series[idx].cashflow += item.qty * ratenBetrag;
        }
      }
    }
    return series;
  }, [useAvgContract, avgAbschluesseTotal, baseline.avg_contract_value, productLineItems]);

  const cashflowMax = Math.max(1, ...cashflowSeries.map((p) => p.cashflow));
  const cashflow12mo = cashflowSeries
    .slice(0, 12)
    .reduce((s, p) => s + p.cashflow, 0);

  const baselineSourceLabel =
    baseline.source === "snapshots"
      ? `Aus den letzten Monats-Snapshots aller ${baseline.members_total} Mitarbeiter:innen`
      : baseline.source === "mixed"
      ? `${baseline.members_with_snapshot} von ${baseline.members_total} mit Snapshot, Rest mit Admin-Defaults`
      : `Keine Snapshots vorhanden — Werte aus den Admin-Defaults gemittelt`;

  const qualisPerWeekNeeded = qualisNeeded / WEEKS_PER_MONTH;
  const qualisPerMemberPerWeekNeeded = qualisPerMemberNeeded / WEEKS_PER_MONTH;
  const avgContractDisabled = baseline.avg_contract_value <= 0;

  return (
    <div className="space-y-6">
      {useAvgContract ? (
        <div className="bg-[color:var(--brand-green)]/10 border-2 border-[color:var(--brand-green)] rounded-lg p-5">
          <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
            <label
              htmlFor="zielumsatz-input"
              className="text-sm font-semibold text-[color:var(--foreground)]"
            >
              Zielumsatz / Monat
            </label>
            <span className="text-xs text-[color:var(--muted)]">
              Ø-Vertragswert: {formatEUR(baseline.avg_contract_value)}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-semibold text-[color:var(--muted)]">
                €
              </span>
              <input
                id="zielumsatz-input"
                type="text"
                inputMode="numeric"
                value={zielumsatzInput}
                onChange={(e) => setZielumsatzInput(e.target.value)}
                onBlur={commitZielumsatz}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitZielumsatz();
                  }
                }}
                placeholder="50.000"
                className="block w-full border-2 border-[color:var(--brand-green)]/40 focus:border-[color:var(--brand-green)] rounded-md pl-9 pr-3 py-3 text-2xl font-semibold tabular-nums bg-white outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-[color:var(--muted)] mt-2">
            Eingabe und Enter (oder Klick außerhalb) rechnet den Qualis-Slider
            zurück — über Showup × Closing × Ø-Vertragswert.
          </p>
        </div>
      ) : null}

      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 accent-[color:var(--brand-blue)] disabled:opacity-50"
            checked={!useAvgContract}
            disabled={avgContractDisabled && useAvgContract}
            onChange={(e) => setUseAvgContract(!e.target.checked)}
          />
          <span>
            <span className="text-sm font-medium">
              Stattdessen nach Produkten planen
            </span>
            <span className="block text-xs text-[color:var(--muted)] mt-0.5">
              Standard ist Planen über den Ø-Vertragswert. Wer pro Produkt
              Stückzahlen eintragen will, klickt hier.
            </span>
          </span>
        </label>
      </div>

      <div className="bg-[color:var(--brand-yellow)]/20 border border-[color:var(--brand-yellow)] rounded-lg px-4 py-3 text-xs">
        <div className="font-medium mb-1">Team-Ø als Ausgangsbasis</div>
        <div className="text-[color:var(--muted)] mb-2">{baselineSourceLabel}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[color:var(--foreground)]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">Mitarbeiter:innen</div>
            <div className="text-lg font-semibold tabular-nums">{baseline.members_total}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">Ø Qualis/Person</div>
            <div className="text-lg font-semibold tabular-nums">
              {baseline.qualis_per_member.toLocaleString("de-AT", { maximumFractionDigits: 1 })}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">Ø Showup-Rate</div>
            <div className="text-lg font-semibold tabular-nums">
              {baseline.showup_rate.toLocaleString("de-AT", { maximumFractionDigits: 1 })} %
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">Ø Closing-Rate</div>
            <div className="text-lg font-semibold tabular-nums">
              {baseline.close_rate.toLocaleString("de-AT", { maximumFractionDigits: 1 })} %
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)] mb-2">
          Funnel-Annahmen (Default = Team-Ø, kannst du anpassen)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SliderRow
            label={
              useAvgContract
                ? "Qualis vereinbart / Woche"
                : "Qualis benötigt / Woche"
            }
            min={0}
            max={75}
            step={1}
            value={
              useAvgContract
                ? avgQualisPerWeek
                : Math.min(75, Math.round(qualisPerWeekNeeded))
            }
            onChange={(v) => setAvgQualisPerWeek(Math.round(v))}
            disabled={!useAvgContract}
            hint={
              useAvgContract
                ? undefined
                : "errechnet aus den Stückzahlen"
            }
            accent="blue"
          />
          <SliderRow
            label="Showup-Rate"
            unit="%"
            min={0}
            max={100}
            step={0.5}
            value={showup}
            onChange={setShowup}
            hint={`Team-Ø ${baseline.showup_rate.toFixed(1)} %`}
            accent="orange"
          />
          <SliderRow
            label="Closing-Rate"
            unit="%"
            min={0}
            max={100}
            step={0.5}
            value={close}
            onChange={setClose}
            hint={`Team-Ø ${baseline.close_rate.toFixed(1)} %`}
            accent="green"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResultCard
          label="Qualis benötigt / Woche"
          value={qualisPerWeekNeeded.toLocaleString("de-AT", { maximumFractionDigits: 1 })}
          sub={
            baseline.members_total > 0
              ? `≈ ${qualisPerMemberPerWeekNeeded.toLocaleString("de-AT", { maximumFractionDigits: 1 })} pro Person (${baseline.members_total} MA)`
              : "Keine Mitarbeiter:innen"
          }
          tone="primary"
        />
        <ResultCard
          label="Showups benötigt / Monat"
          value={showupsNeeded.toLocaleString("de-AT", { maximumFractionDigits: 0 })}
          sub={`Bei ${showup.toFixed(1)} % Showup-Rate`}
          tone="neutral"
        />
        <ResultCard
          label="Abschlüsse / Monat"
          value={abschluesseTotal.toLocaleString("de-AT")}
          sub={
            avgDealSize > 0
              ? `Ø Vertragswert ${formatEUR(avgDealSize)}`
              : useAvgContract
              ? "Anzahl Abschlüsse eintragen"
              : "Noch keine Stückzahlen eingetragen"
          }
          tone="neutral"
        />
        <ResultCard
          label="Umsatz / Monat (Ziel)"
          value={formatEUR(umsatzTotal)}
          sub={
            umsatzUpsell > 0
              ? `${formatEUR(umsatzAbschluss)} Erstabschluss + ${formatEUR(umsatzUpsell)} Upsell`
              : `Cashflow nächste 12 Mo: ${formatEUR(cashflow12mo)}`
          }
          tone="highlight"
        />
      </div>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <h2 className="font-semibold">Cashflow-Projektion (24 Monate)</h2>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Bei monatlichem Erreichen des Ziels — die Raten der Produkte verteilen den Cashflow über die Folgemonate.
          </p>
        </div>
        <div className="px-4 py-4">
          {umsatzTotal === 0 ? (
            <div className="text-sm text-[color:var(--muted)] text-center py-8">
              Stückzahlen eintragen, um die Cashflow-Projektion zu sehen.
            </div>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {cashflowSeries.map((p) => (
                <div
                  key={p.month}
                  className="flex-1 flex flex-col items-center justify-end group relative"
                  style={{ minWidth: 0 }}
                >
                  <div
                    className="w-full bg-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/80 rounded-t"
                    style={{
                      height: `${(p.cashflow / cashflowMax) * 100}%`,
                      minHeight: p.cashflow > 0 ? "2px" : "0",
                    }}
                    title={`${p.label}: ${formatEUR(p.cashflow)}`}
                  />
                  <div className="text-[9px] text-[color:var(--muted)] mt-1 truncate w-full text-center">
                    {p.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="flex items-end justify-between gap-3 pt-2">
        <div>
          {useAvgContract ? (
            <>
              <h2 className="text-lg font-semibold">Funnel über Ø-Vertragswert</h2>
              <p className="text-xs text-[color:var(--muted)] mt-1">
                Zielumsatz oben oder Qualis-Slider in den Funnel-Annahmen ergeben automatisch Abschlüsse und Umsatz.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Ziel-Stückzahl pro Produkt</h2>
              <p className="text-xs text-[color:var(--muted)] mt-1">
                Trag hier ein, wie viele Stück du pro Monat von welchem Produkt verkaufen willst.
              </p>
            </>
          )}
        </div>
        <button
          onClick={reset}
          className="text-sm px-4 py-2 rounded bg-[color:var(--brand-blue)] text-white font-medium hover:opacity-90 shrink-0"
        >
          Zurücksetzen
        </button>
      </div>

      {useAvgContract ? null : products.length === 0 ? (
        <section className="bg-white border border-[color:var(--border)] rounded-lg p-8 text-center text-sm text-[color:var(--muted)]">
          Noch keine aktiven Produkte angelegt — bitte im Admin pflegen, oder
          oben die Option „Aus durchschnittlichem Vertragswert errechnen" aktivieren.
        </section>
      ) : (
        <ProductTable
          title="Beratungsprodukte (Erstabschluss)"
          subtitle="Jedes Stück = ein Beratungsgespräch durch den Funnel."
          products={products.filter((p) => !p.is_upsell)}
          quantities={quantities}
          setQty={setQty}
          summeStk={abschluesseTotal}
          summeRevenue={umsatzAbschluss}
          showStkSumme
        />
      )}

      {!useAvgContract && products.some((p) => p.is_upsell) ? (
        <ProductTable
          title="Upsells (in laufender Beratung)"
          subtitle="Werden innerhalb bestehender Beratungen verkauft — keine zusätzlichen Beratungsgespräche nötig, nur Umsatz."
          products={products.filter((p) => p.is_upsell)}
          quantities={quantities}
          setQty={setQty}
          summeStk={upsellItems.reduce((s, x) => s + x.qty, 0)}
          summeRevenue={umsatzUpsell}
          showStkSumme={false}
          accent="blue"
        />
      ) : null}
    </div>
  );
}
