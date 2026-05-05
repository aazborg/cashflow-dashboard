import type { Deal } from "./types";
import { INTERVALL_MONATE } from "./types";

export interface MonthRow {
  month: string;
  monthLabel: string;
  total: number;
  byMitarbeiter: Record<string, number>;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return r;
}

const MONTH_NAMES_DE = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export function expandPayments(deal: Deal): { date: Date; amount: number }[] {
  if (!deal.start_datum || !deal.intervall || !deal.anzahl_raten || deal.anzahl_raten < 1) {
    return [];
  }
  const start = new Date(deal.start_datum);
  if (Number.isNaN(start.getTime())) return [];
  const intervalMonths = INTERVALL_MONATE[deal.intervall];
  const rate = deal.betrag / deal.anzahl_raten;
  const out: { date: Date; amount: number }[] = [];
  for (let i = 0; i < deal.anzahl_raten; i++) {
    out.push({ date: addMonths(start, i * intervalMonths), amount: rate });
  }
  return out;
}

export function buildCashflow(
  deals: Deal[],
  options: { from?: Date; maxMonths?: number } = {},
): { mitarbeiter: { id: string; name: string }[]; rows: MonthRow[] } {
  const mitMap = new Map<string, string>();
  for (const d of deals) {
    if (!mitMap.has(d.mitarbeiter_id)) {
      mitMap.set(d.mitarbeiter_id, d.mitarbeiter_name);
    }
  }
  const mitarbeiter = [...mitMap.entries()].map(([id, name]) => ({ id, name }));

  const allPayments = deals.flatMap((d) =>
    expandPayments(d).map((p) => ({ ...p, mitarbeiter_id: d.mitarbeiter_id })),
  );

  const now = options.from ?? new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const futurePayments = allPayments.filter(
    (p) => new Date(p.date.getFullYear(), p.date.getMonth(), 1) >= firstMonth,
  );

  let lastMonth = firstMonth;
  for (const p of futurePayments) {
    const m = new Date(p.date.getFullYear(), p.date.getMonth(), 1);
    if (m > lastMonth) lastMonth = m;
  }

  let monthsCount =
    (lastMonth.getFullYear() - firstMonth.getFullYear()) * 12 +
    (lastMonth.getMonth() - firstMonth.getMonth()) +
    1;
  if (options.maxMonths) monthsCount = Math.min(monthsCount, options.maxMonths);
  if (monthsCount < 1) monthsCount = 1;

  const rows: MonthRow[] = [];
  for (let i = 0; i < monthsCount; i++) {
    const m = addMonths(firstMonth, i);
    const key = monthKey(m);
    const byMitarbeiter: Record<string, number> = {};
    for (const mit of mitarbeiter) byMitarbeiter[mit.id] = 0;
    rows.push({
      month: key,
      monthLabel: `${MONTH_NAMES_DE[m.getMonth()]} ${m.getFullYear()}`,
      total: 0,
      byMitarbeiter,
    });
  }

  const indexByKey = new Map(rows.map((r, i) => [r.month, i]));

  for (const p of futurePayments) {
    const key = monthKey(p.date);
    const idx = indexByKey.get(key);
    if (idx === undefined) continue;
    const row = rows[idx];
    row.total += p.amount;
    row.byMitarbeiter[p.mitarbeiter_id] =
      (row.byMitarbeiter[p.mitarbeiter_id] ?? 0) + p.amount;
  }

  return { mitarbeiter, rows };
}

export interface MonthlyCashflowPoint {
  month: string;
  monthLabel: string;
  cashflow: number;
  isPast: boolean;
}

export function monthlySeriesForMitarbeiter(
  deals: Deal[],
  mitarbeiterId: string | null,
  options: { from: Date; until: Date; now?: Date } = {
    from: new Date(new Date().getFullYear(), 0, 1),
    until: new Date(new Date().getFullYear() + 1, 11, 1),
  },
): MonthlyCashflowPoint[] {
  const now = options.now ?? new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(options.from.getFullYear(), options.from.getMonth(), 1);
  const end = new Date(options.until.getFullYear(), options.until.getMonth(), 1);

  const filtered = mitarbeiterId
    ? deals.filter((d) => d.mitarbeiter_id === mitarbeiterId)
    : deals;

  const points: MonthlyCashflowPoint[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    points.push({
      month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      monthLabel: `${MONTH_NAMES_DE[cursor.getMonth()]} ${cursor.getFullYear()}`,
      cashflow: 0,
      isPast: cursor < currentMonthStart,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  const idx = new Map(points.map((p, i) => [p.month, i]));

  for (const d of filtered) {
    if (d.pending_delete) continue;
    for (const p of expandPayments(d)) {
      const key = `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, "0")}`;
      const i = idx.get(key);
      if (i === undefined) continue;
      points[i].cashflow += p.amount;
    }
  }
  return points;
}

export function avgVerkaufspreis(deals: Deal[], mitarbeiterId: string | null): number | null {
  const filtered = (mitarbeiterId
    ? deals.filter((d) => d.mitarbeiter_id === mitarbeiterId)
    : deals
  ).filter(
    (d) =>
      !d.pending_delete &&
      d.betrag > 0 &&
      d.source !== "legacy",
  );
  if (filtered.length === 0) return null;
  const total = filtered.reduce((s, d) => s + d.betrag, 0);
  return total / filtered.length;
}

export interface CashDistribution {
  pct: number[];
  dealsAnalyzed: number;
  sameMonthPct: number;
  followingPct: number;
}

export function cashDistribution(
  deals: Deal[],
  mitarbeiterId: string | null,
): CashDistribution {
  const filtered = (mitarbeiterId
    ? deals.filter((d) => d.mitarbeiter_id === mitarbeiterId)
    : deals
  ).filter(
    (d) =>
      !d.pending_delete &&
      d.source !== "legacy" &&
      d.betrag > 0 &&
      d.start_datum &&
      d.intervall &&
      d.anzahl_raten &&
      d.anzahl_raten > 0,
  );

  if (filtered.length === 0) {
    return { pct: [1], dealsAnalyzed: 0, sameMonthPct: 1, followingPct: 0 };
  }

  const offsetTotals: Record<number, number> = {};
  let grand = 0;
  for (const d of filtered) {
    const intervalMonths = INTERVALL_MONATE[d.intervall!];
    const rate = d.betrag / d.anzahl_raten!;
    for (let i = 0; i < d.anzahl_raten!; i++) {
      const offset = i * intervalMonths;
      offsetTotals[offset] = (offsetTotals[offset] ?? 0) + rate;
      grand += rate;
    }
  }

  const maxOffset = Math.max(...Object.keys(offsetTotals).map(Number));
  const pct: number[] = [];
  for (let i = 0; i <= maxOffset; i++) {
    pct[i] = (offsetTotals[i] ?? 0) / grand;
  }
  return {
    pct,
    dealsAnalyzed: filtered.length,
    sameMonthPct: pct[0] ?? 0,
    followingPct: 1 - (pct[0] ?? 0),
  };
}

export interface OutstandingRow {
  mitarbeiter_id: string;
  mitarbeiter_name: string;
  total: number;
  openPayments: number;
  dealCount: number;
}

export function outstandingByMitarbeiter(
  deals: Deal[],
  asOf: Date = new Date(),
): OutstandingRow[] {
  const cutoff = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const map = new Map<string, OutstandingRow>();
  for (const d of deals) {
    if (d.pending_delete) continue;
    if (!map.has(d.mitarbeiter_id)) {
      map.set(d.mitarbeiter_id, {
        mitarbeiter_id: d.mitarbeiter_id,
        mitarbeiter_name: d.mitarbeiter_name,
        total: 0,
        openPayments: 0,
        dealCount: 0,
      });
    }
    const row = map.get(d.mitarbeiter_id)!;
    row.dealCount += 1;
    for (const p of expandPayments(d)) {
      if (p.date >= cutoff) {
        row.total += p.amount;
        row.openPayments += 1;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function formatEUR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatEURPrecise(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
