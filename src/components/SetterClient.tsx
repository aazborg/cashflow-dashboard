"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { logRechnerEventAction } from "@/lib/actions";
import { formatEUR } from "@/lib/cashflow";
import {
  SETTER_TARIFFS,
  calcSetterPayout,
  type SetterTariff,
} from "@/lib/setter-tiers";
import type { SetterHours } from "@/lib/types";

const WEEKS_PER_MONTH = 4;

export interface SetterOption {
  id: string;
  name: string;
  setter_hours: SetterHours | null;
}

export default function SetterClient({
  setters,
  canSeeAll,
}: {
  setters: SetterOption[];
  canSeeAll: boolean;
}) {
  const [setterId, setSetterId] = useState(setters[0]?.id ?? "");
  const setter = setters.find((s) => s.id === setterId) ?? setters[0];

  const variant: SetterHours | null = setter?.setter_hours ?? null;
  const tariff: SetterTariff | null = variant ? SETTER_TARIFFS[variant] : null;

  const [bgsPerWeek, setBgsPerWeek] = useState(0);
  const bgs = bgsPerWeek * WEEKS_PER_MONTH;
  const calc = useMemo(
    () => (tariff ? calcSetterPayout(tariff, bgs) : null),
    [tariff, bgs],
  );

  // Silent Telemetry — 3-Sek-Debounce. Erstes Render wird übersprungen.
  const skipFirstLog = useRef(true);
  useEffect(() => {
    if (!setter || !tariff || !calc) return;
    if (skipFirstLog.current) {
      skipFirstLog.current = false;
      return;
    }
    if (bgsPerWeek <= 0) return; // nichts berechnet → nicht loggen
    const timer = setTimeout(() => {
      const fd = new FormData();
      fd.set("mode", "setter");
      fd.set("qualis", String(bgs)); // BGs pro Monat als "qualis"
      fd.set("showup", String(bgsPerWeek)); // BGs pro Woche als "showup"
      fd.set("close_rate", "0");
      fd.set("avg_contract", String(tariff.fixum));
      fd.set("expected_value", String(calc.bruttogehalt));
      fd.set("data_month", tariff.hours);
      logRechnerEventAction(fd).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgsPerWeek, bgs, tariff?.hours, calc?.bruttogehalt, setter?.id]);

  if (!setter) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        {canSeeAll ? (
          <div className="flex-1 min-w-48">
            <label className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              Setter
            </label>
            <select
              value={setterId}
              onChange={(e) => setSetterId(e.target.value)}
              className="mt-1 block w-full border border-[color:var(--border)] rounded px-3 py-2 text-sm bg-white"
            >
              {setters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.setter_hours ? ` · ${s.setter_hours}` : " · (kein Vertrag)"}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex-1 min-w-48">
            <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              Setter
            </div>
            <div className="text-base font-semibold mt-1">{setter.name}</div>
          </div>
        )}
        {tariff ? (
          <div className="flex-1 min-w-48">
            <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              Vertrag
            </div>
            <div className="text-base font-semibold mt-1">
              {tariff.hours} · Fixum {formatEUR(tariff.fixum)}
            </div>
          </div>
        ) : null}
      </div>

      {!tariff ? (
        <div className="bg-[color:var(--brand-yellow)]/20 border border-[color:var(--brand-yellow)] rounded-lg p-6 text-sm">
          Für diesen Setter ist noch kein Stunden-Vertrag hinterlegt. Bitte
          den Admin, im Mitarbeiter-Bereich einen Vertrag (20h / 25h / 30h /
          35h / 40h) zu wählen — danach erscheinen Slider und Tier-Tabelle.
        </div>
      ) : (
        <>
          <div className="bg-white border-2 border-[color:var(--brand-blue)] rounded-lg p-5">
            {(() => {
              const maxBgsPerMonth = Math.max(
                180,
                tariff.tiers[tariff.tiers.length - 1].from + 30,
              );
              const maxBgsPerWeek = Math.ceil(maxBgsPerMonth / WEEKS_PER_MONTH);
              return (
                <>
                  <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
                    <label
                      htmlFor="bgs-input"
                      className="text-sm font-semibold text-[color:var(--foreground)]"
                    >
                      Erschienene Beratungsgespräche / Woche
                    </label>
                    <span className="text-2xl font-semibold tabular-nums">
                      {bgsPerWeek} BGs/Wo
                    </span>
                  </div>
                  <input
                    id="bgs-input"
                    type="range"
                    min={0}
                    max={maxBgsPerWeek}
                    step={1}
                    value={bgsPerWeek}
                    onChange={(e) => setBgsPerWeek(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: "var(--brand-blue)" }}
                  />
                  <div className="flex justify-between text-xs text-[color:var(--muted)] mt-1">
                    <span>0</span>
                    <span>= {bgs} BGs / Monat</span>
                    <span>{maxBgsPerWeek}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <span className="text-[color:var(--muted)]">
                      oder direkt eingeben (pro Woche):
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={bgsPerWeek || ""}
                      onChange={(e) =>
                        setBgsPerWeek(
                          Math.max(0, Math.round(Number(e.target.value) || 0)),
                        )
                      }
                      className="border border-[color:var(--border)] rounded px-2 py-1 w-24 text-right tabular-nums bg-white"
                    />
                  </div>
                </>
              );
            })()}
          </div>

          {calc ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ResultCard
                label="Status"
                value={calc.activeTier?.label ?? "🧊 Cold Zone"}
                sub={
                  calc.activeTier
                    ? `ab ${calc.activeTier.from} BGs → ${calc.perBg.toLocaleString("de-AT", { maximumFractionDigits: 2 })} € pro BG`
                    : `bis ${tariff.coldZoneUpTo} BGs nur Fixum`
                }
                tone="primary"
              />
              <ResultCard
                label="Variable Provision"
                value={formatEUR(calc.variableEur)}
                sub={`${bgs} × ${formatEUR(calc.perBg)}`}
                tone="neutral"
              />
              <ResultCard
                label="Bruttogehalt"
                value={formatEUR(calc.bruttogehalt)}
                sub={`${formatEUR(calc.fixum)} Fixum + ${formatEUR(calc.variableEur)}`}
                tone="highlight"
              />
            </div>
          ) : null}

          <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[color:var(--border)]">
              <h2 className="font-semibold">Tier-Übersicht ({tariff.hours})</h2>
              <p className="text-xs text-[color:var(--muted)] mt-1">
                Aktiver Tier ist hervorgehoben. Fixum {formatEUR(tariff.fixum)}.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface)] text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Erschienene Termine</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">€ pro BG</th>
                  <th className="px-3 py-2 font-medium text-right">Beispiel-Gehalt</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  className={`border-t border-[color:var(--border)] ${
                    bgs <= tariff.coldZoneUpTo
                      ? "bg-[color:var(--brand-yellow)]/15"
                      : ""
                  }`}
                >
                  <td className="px-3 py-2">0 – {tariff.coldZoneUpTo}</td>
                  <td className="px-3 py-2">🧊 Cold Zone</td>
                  <td className="px-3 py-2 text-right tabular-nums">— €</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEUR(tariff.fixum)}
                  </td>
                </tr>
                {tariff.tiers.map((t, i) => {
                  const isActive = calc?.activeTier?.from === t.from;
                  const beispiel = tariff.fixum + t.from * t.perBg;
                  return (
                    <tr
                      key={t.from}
                      className={`border-t border-[color:var(--border)] ${
                        isActive ? "bg-[color:var(--brand-blue)]/10 font-medium" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        ab {t.from}
                        {i < tariff.tiers.length - 1
                          ? ` (bis ${tariff.tiers[i + 1].from - 1})`
                          : ""}
                      </td>
                      <td className="px-3 py-2">{t.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.perBg.toLocaleString("de-AT", { maximumFractionDigits: 2 })} €
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ab {formatEUR(beispiel)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
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
    neutral: {
      bar: "var(--brand-grey)",
      valueColor: "text-[color:var(--foreground)]",
      border: "border border-[color:var(--border)]",
      bg: "bg-white",
    },
    primary: {
      bar: "var(--brand-blue)",
      valueColor: "text-[color:var(--brand-blue)]",
      border: "border border-[color:var(--brand-blue)]",
      bg: "bg-white",
    },
    highlight: {
      bar: "var(--brand-green)",
      valueColor: "text-[color:var(--brand-green)]",
      border: "border-2 border-[color:var(--brand-green)]",
      bg: "bg-[color:var(--brand-green)]/10",
    },
  }[tone];
  return (
    <div className={`rounded-lg p-5 relative overflow-hidden ${config.bg} ${config.border}`}>
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: config.bar }} />
      <div className="pl-2">
        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
          {label}
        </div>
        <div className={`text-2xl font-semibold mt-1 tabular-nums ${config.valueColor}`}>
          {value}
        </div>
        {sub ? (
          <div className="text-xs text-[color:var(--muted)] mt-1">{sub}</div>
        ) : null}
      </div>
    </div>
  );
}
