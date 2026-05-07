"use client";

import { useMemo, useState } from "react";
import { formatEUR } from "@/lib/cashflow";
import {
  SETTER_TARIFFS,
  calcSetterPayout,
  type SetterTariff,
} from "@/lib/setter-tiers";
import type { SetterHours } from "@/lib/types";

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

  // Falls dem Setter (noch) kein Vertrag zugewiesen wurde, kann er hier
  // einen zur Simulation wählen — Admin ändert das dann real im Admin-Tab.
  const [variantOverride, setVariantOverride] =
    useState<SetterHours | null>(null);
  const variant: SetterHours | null =
    variantOverride ?? setter?.setter_hours ?? null;

  const tariff: SetterTariff | null = variant ? SETTER_TARIFFS[variant] : null;
  const [bgs, setBgs] = useState(0);
  const calc = useMemo(
    () => (tariff ? calcSetterPayout(tariff, bgs) : null),
    [tariff, bgs],
  );

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
              onChange={(e) => {
                setSetterId(e.target.value);
                setVariantOverride(null);
              }}
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
        <div className="flex-1 min-w-48">
          <label className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
            Stunden-Vertrag
          </label>
          <select
            value={variant ?? ""}
            onChange={(e) =>
              setVariantOverride((e.target.value as SetterHours) || null)
            }
            className="mt-1 block w-full border border-[color:var(--border)] rounded px-3 py-2 text-sm bg-white"
          >
            <option value="">— bitte wählen —</option>
            {(["20h", "25h", "30h", "35h", "40h"] as SetterHours[]).map((h) => (
              <option key={h} value={h}>
                {h} (Fixum {formatEUR(SETTER_TARIFFS[h].fixum)})
              </option>
            ))}
          </select>
          {!setter.setter_hours ? (
            <div className="text-[11px] text-[color:var(--brand-orange)] mt-1">
              Kein Vertrag im Admin gesetzt — nur Simulation.
            </div>
          ) : variantOverride && variantOverride !== setter.setter_hours ? (
            <div className="text-[11px] text-[color:var(--brand-orange)] mt-1">
              Simulation — der echte Vertrag bleibt {setter.setter_hours}.
            </div>
          ) : null}
        </div>
      </div>

      {!tariff ? (
        <div className="bg-white border border-[color:var(--border)] rounded-lg p-8 text-center text-sm text-[color:var(--muted)]">
          Bitte oben einen Stunden-Vertrag wählen.
        </div>
      ) : (
        <>
          <div className="bg-white border-2 border-[color:var(--brand-blue)] rounded-lg p-5">
            <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
              <label
                htmlFor="bgs-input"
                className="text-sm font-semibold text-[color:var(--foreground)]"
              >
                Erschienene Beratungsgespräche / Monat
              </label>
              <span className="text-xs text-[color:var(--muted)]">
                Vertrag {tariff.hours} · Fixum {formatEUR(tariff.fixum)}
              </span>
            </div>
            <input
              id="bgs-input"
              type="range"
              min={0}
              max={Math.max(180, tariff.tiers[tariff.tiers.length - 1].from + 30)}
              step={1}
              value={bgs}
              onChange={(e) => setBgs(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--brand-blue)" }}
            />
            <div className="flex justify-between text-xs text-[color:var(--muted)] mt-1">
              <span>0</span>
              <span className="text-2xl font-semibold tabular-nums text-[color:var(--foreground)]">
                {bgs} BGs
              </span>
              <span>{Math.max(180, tariff.tiers[tariff.tiers.length - 1].from + 30)}</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-[color:var(--muted)]">oder direkt eingeben:</span>
              <input
                type="number"
                min={0}
                value={bgs || ""}
                onChange={(e) =>
                  setBgs(Math.max(0, Math.round(Number(e.target.value) || 0)))
                }
                className="border border-[color:var(--border)] rounded px-2 py-1 w-24 text-right tabular-nums bg-white"
              />
            </div>
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
