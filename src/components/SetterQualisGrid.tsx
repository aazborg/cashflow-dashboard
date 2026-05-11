"use client";

import { useState, useTransition } from "react";
import { upsertSetterQualisAction } from "@/lib/actions";
import { SETTER_TARIFFS, calcSetterPayout } from "@/lib/setter-tiers";
import type { Employee, SetterMonthlyQualis } from "@/lib/types";
import { formatEUR } from "@/lib/cashflow";

interface Props {
  setters: Employee[];
  existing: SetterMonthlyQualis[];
}

const MONTHS_DE = [
  "Jän",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

function monthKey(year: number, monthIdx0: number): string {
  return `${year}-${String(monthIdx0 + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, mon] = month.split("-");
  const m = Number.parseInt(mon, 10);
  if (Number.isNaN(m) || m < 1 || m > 12) return month;
  return `${MONTHS_DE[m - 1]} ${year.slice(2)}`;
}

function setterMitId(e: Employee): string {
  return e.hubspot_owner_id ?? e.id;
}

export default function SetterQualisGrid({ setters, existing }: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const months: string[] = [];
  for (let m = 0; m < 12; m++) months.push(monthKey(selectedYear, m));

  // Lookup-Map: "mitId|month" -> qualis
  const byKey = new Map<string, number>();
  for (const e of existing) byKey.set(`${e.mitarbeiter_id}|${e.month}`, e.qualis);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <label className="text-xs text-[color:var(--muted)] inline-flex items-center gap-2">
          Jahr
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number.parseInt(e.target.value, 10))}
            className="border border-[color:var(--border)] rounded px-2 py-1 text-sm tabular-nums bg-white"
          >
            {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map(
              (y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ),
            )}
          </select>
        </label>
        <span className="text-xs text-[color:var(--muted)]">
          Anzahl erschienener Qualis pro Setter und Monat. Tier-Berechnung
          (Fixum + variabel) wird in der Provisions-E-Mail verwendet.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)]">
            <tr>
              <th className="text-left px-3 py-2 font-medium sticky left-0 bg-[color:var(--surface)] z-10">
                Setter · Vertrag · Fixum
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="text-center px-2 py-2 font-medium tabular-nums whitespace-nowrap"
                >
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {setters.map((s) => (
              <SetterRow
                key={s.id}
                employee={s}
                months={months}
                byKey={byKey}
              />
            ))}
            {setters.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  className="px-3 py-6 text-center text-[color:var(--muted)] text-sm"
                >
                  Keine aktiven Setter — im Mitarbeiter-Bereich „Setter"-Rolle
                  setzen und Setter-Vertrag (Stunden) wählen.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SetterRow({
  employee,
  months,
  byKey,
}: {
  employee: Employee;
  months: string[];
  byKey: Map<string, number>;
}) {
  const mitId = setterMitId(employee);
  const tariff = employee.setter_hours
    ? SETTER_TARIFFS[employee.setter_hours]
    : null;
  return (
    <tr className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]">
      <td className="px-3 py-2 sticky left-0 bg-white">
        <div className="font-medium">{employee.name}</div>
        <div className="text-xs text-[color:var(--muted)]">
          {employee.setter_hours ?? "—"}
          {tariff ? ` · Fixum ${formatEUR(tariff.fixum)}` : ""}
        </div>
      </td>
      {months.map((m) => {
        const initial = byKey.get(`${mitId}|${m}`) ?? 0;
        return (
          <SetterCell
            key={m}
            mitarbeiter_id={mitId}
            month={m}
            initial={initial}
            tariff={tariff}
          />
        );
      })}
    </tr>
  );
}

function SetterCell({
  mitarbeiter_id,
  month,
  initial,
  tariff,
}: {
  mitarbeiter_id: string;
  month: string;
  initial: number;
  tariff: (typeof SETTER_TARIFFS)[keyof typeof SETTER_TARIFFS] | null;
}) {
  const [value, setValue] = useState(String(initial));
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save() {
    const numValue = Number.parseInt(value || "0", 10);
    if (numValue === initial) return;
    const fd = new FormData();
    fd.set("mitarbeiter_id", mitarbeiter_id);
    fd.set("month", month);
    fd.set("qualis", String(Math.max(0, numValue)));
    startTransition(async () => {
      try {
        await upsertSetterQualisAction(fd);
        setSavedAt(Date.now());
      } catch {
        // Re-fetch wäre besser, hier reicht visuelles Feedback.
      }
    });
  }

  const qualis = Number.parseInt(value || "0", 10) || 0;
  const calc = tariff ? calcSetterPayout(tariff, qualis) : null;
  const isStale = savedAt && Date.now() - savedAt < 1500;

  return (
    <td className="px-2 py-2 align-top">
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`w-16 text-right tabular-nums border rounded px-2 py-1 text-sm ${
          isStale
            ? "border-[color:var(--brand-green)] bg-[color:var(--brand-green)]/10"
            : "border-[color:var(--border)]"
        }`}
      />
      {calc && qualis > 0 ? (
        <div
          className="text-[10px] text-[color:var(--muted)] tabular-nums mt-0.5 text-center"
          title={`Tier: ${calc.activeTier?.label ?? "Cold Zone"} · ${
            calc.perBg
          } €/BG`}
        >
          + {formatEUR(calc.variableEur)}
        </div>
      ) : null}
    </td>
  );
}
