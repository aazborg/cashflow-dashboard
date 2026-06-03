"use client";

/**
 * Seminarvorbereitung-Tab. Wochen-Picker + Seminar-Liste +
 * konfigurierbare Produkt-Bedarfsberechnung.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

interface SeminarHit {
  event_id: number;
  name: string;
  von: string;
  bis: string;
  location?: string | null;
  aktive: number;
  max: number;
  qualification_id?: number | null;
  qualification_name?: string | null;
}

interface DayBucket {
  datum: string;
  weekday: string;
  events: SeminarHit[];
}

interface WeekResponse {
  ok: boolean;
  from: string;
  to: string;
  days: DayBucket[];
  events_count: number;
  seminartage: number;
  summe_teilnehmer_tage: number;
  summe_teilnehmer_unique: number;
  error?: string;
}

type BerechnungsTyp =
  | "pro_monat"
  | "pro_teilnehmer_woche"
  | "pro_teilnehmer_tag"
  | "pro_seminartag"
  | "fix_pro_woche";

interface Produkt {
  id: string;
  name: string;
  einheit: string;
  berechnungs_typ: BerechnungsTyp;
  menge_pro_einheit: number;
  sortierung: number;
  aktiv: boolean;
  notiz: string | null;
}

const BERECHNUNG_LABELS: Record<BerechnungsTyp, string> = {
  pro_monat: "Stk/Monat (÷4)",
  pro_teilnehmer_woche: "pro Teilnehmer/Woche",
  pro_teilnehmer_tag: "pro Teilnehmer/Tag",
  pro_seminartag: "pro Seminartag",
  fix_pro_woche: "fix pro Woche",
};

export default function SeminarvorbereitungClient() {
  const [weekStart, setWeekStart] = useState<string>(() => nextSaturday());
  const [week, setWeek] = useState<WeekResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [pLoading, setPLoading] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/cashflow/api/seminarmanagement/week?from=${weekStart}&to=${weekEnd}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as WeekResponse;
      if (!r.ok || j.ok === false) {
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setWeek(j);
    } catch (err) {
      setError((err as Error).message);
      setWeek(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  const loadProdukte = useCallback(async () => {
    setPLoading(true);
    try {
      const r = await fetch(`/cashflow/api/seminarmanagement/produkte`, {
        cache: "no-store",
      });
      const j = (await r.json()) as {
        ok?: boolean;
        produkte?: Produkt[];
        error?: string;
      };
      if (r.ok && j.ok !== false) setProdukte(j.produkte ?? []);
    } catch {
      /* ignore */
    } finally {
      setPLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    void loadProdukte();
  }, [loadProdukte]);

  function jumpWeeks(n: number) {
    setWeekStart((cur) => addDays(cur, 7 * n));
  }

  return (
    <div className="space-y-6">
      {/* Wochen-Picker */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => jumpWeeks(-1)}
              className="px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30 text-sm"
            >
              ◀
            </button>
            <div className="text-sm font-semibold tabular-nums">
              {fmtDate(weekStart)} – {fmtDate(weekEnd)}
            </div>
            <button
              type="button"
              onClick={() => jumpWeeks(1)}
              className="px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30 text-sm"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(nextSaturday())}
              className="ml-2 px-2 py-1 text-xs underline text-[color:var(--brand-blue)]"
            >
              kommende Lieferwoche
            </button>
          </div>
          <div className="text-xs text-[color:var(--muted)]">
            {loading ? "Lade …" : null}
          </div>
        </div>
        {/* Wochen-Statistik */}
        {week ? (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Seminare" value={week.events_count} />
            <StatCard label="Seminar-Tage" value={week.seminartage} />
            <StatCard
              label="Teilnehmer-Tage"
              value={week.summe_teilnehmer_tage}
              sub={`(${week.summe_teilnehmer_unique} echte Personen)`}
              big
            />
            <StatCard
              label="Ø TN / Seminar-Tag"
              value={
                week.seminartage > 0
                  ? Math.round(
                      (week.summe_teilnehmer_tage / week.seminartage) * 10,
                    ) / 10
                  : 0
              }
            />
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      {/* Wochen-Übersicht */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Wochenübersicht</h2>
        {week && week.days.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-7 gap-2">
            {week.days.map((d) => (
              <div
                key={d.datum}
                className="border border-[color:var(--border)] rounded p-2 min-h-[120px]"
              >
                <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)]">
                  {d.weekday} · {fmtDay(d.datum)}
                </div>
                {d.events.length === 0 ? (
                  <div className="text-[11px] text-[color:var(--muted)] mt-1">
                    —
                  </div>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    {d.events.map((ev, i) => (
                      <div
                        key={`${ev.event_id}-${i}`}
                        className="text-[11px] bg-[color:var(--brand-yellow)]/15 rounded px-1.5 py-1"
                      >
                        <div className="font-medium truncate" title={ev.name}>
                          {ev.name}
                        </div>
                        <div className="text-[10px] text-[color:var(--muted)]">
                          {ev.aktive}/{ev.max || "?"} TN
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : !loading ? (
          <div className="text-xs text-[color:var(--muted)] py-4 text-center">
            Keine Wien-Präsenz-Seminare in dieser Woche.
          </div>
        ) : null}
      </div>

      {/* Produkte */}
      <ProdukteSection
        produkte={produkte}
        loading={pLoading}
        onReload={loadProdukte}
        week={week}
      />
    </div>
  );
}

function ProdukteSection({
  produkte,
  loading,
  onReload,
  week,
}: {
  produkte: Produkt[];
  loading: boolean;
  onReload: () => void;
  week: WeekResponse | null;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold">Produktbedarf</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs px-2.5 py-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30"
        >
          {adding ? "Schließen" : "+ Produkt"}
        </button>
      </div>
      {adding ? (
        <AddProduktForm
          onSuccess={() => {
            setAdding(false);
            onReload();
          }}
        />
      ) : null}
      {loading ? (
        <div className="text-xs text-[color:var(--muted)] py-4 text-center">
          Lade Produkte …
        </div>
      ) : produkte.length === 0 ? (
        <div className="text-xs text-[color:var(--muted)] py-4 text-center">
          Noch keine Produkte definiert.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                <th className="text-left py-2 pr-3 font-semibold">Produkt</th>
                <th className="text-left py-2 pr-3 font-semibold">Schlüssel</th>
                <th className="text-right py-2 pr-3 font-semibold">Menge</th>
                <th className="text-right py-2 pr-3 font-semibold">
                  Wochenbedarf
                </th>
                <th className="text-right py-2 font-semibold w-20">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {produkte.map((p) => {
                const bedarf = computeBedarf(p, week);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-[color:var(--border)]/60"
                  >
                    <td className="py-2 pr-3">
                      <div className="font-medium">{p.name}</div>
                      {p.notiz ? (
                        <div className="text-[11px] text-[color:var(--muted)]">
                          {p.notiz}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[color:var(--muted)]">
                      {BERECHNUNG_LABELS[p.berechnungs_typ]}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmtNum(p.menge_pro_einheit)} {p.einheit}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold text-[color:var(--brand-orange)]">
                      {bedarf == null
                        ? "—"
                        : `${fmtNum(bedarf)} ${p.einheit}`}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Produkt "${p.name}" loeschen?`)) return;
                          await fetch(
                            `/cashflow/api/seminarmanagement/produkte/${p.id}`,
                            { method: "DELETE" },
                          );
                          onReload();
                        }}
                        className="text-[11px] px-2 py-0.5 rounded border border-red-300 text-red-700 hover:bg-red-50 font-semibold"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddProduktForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [einheit, setEinheit] = useState("Stk");
  const [typ, setTyp] = useState<BerechnungsTyp>("pro_teilnehmer_woche");
  const [menge, setMenge] = useState("");
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!name.trim() || !einheit.trim()) {
      setErr("Name + Einheit Pflicht");
      return;
    }
    const m = Number.parseFloat(menge.replace(",", "."));
    if (!Number.isFinite(m) || m <= 0) {
      setErr("Menge muss > 0 sein");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/cashflow/api/seminarmanagement/produkte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          einheit: einheit.trim(),
          berechnungs_typ: typ,
          menge_pro_einheit: m,
          notiz: notiz.trim() || null,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) {
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      onSuccess();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-[color:var(--border)] rounded-md p-3 mb-4 bg-[color:var(--brand-yellow)]/5">
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <input
          placeholder="Name (z. B. Obst)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm sm:col-span-2"
        />
        <input
          placeholder="Einheit"
          value={einheit}
          onChange={(e) => setEinheit(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          step="0.001"
          placeholder="Menge"
          value={menge}
          onChange={(e) => setMenge(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm tabular-nums"
        />
        <select
          value={typ}
          onChange={(e) => setTyp(e.target.value as BerechnungsTyp)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        >
          {(
            Object.entries(BERECHNUNG_LABELS) as [BerechnungsTyp, string][]
          ).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <input
        placeholder="Notiz (optional)"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
        className="mt-2 w-full border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
      />
      {err ? (
        <div className="mt-2 text-xs text-red-700">{err}</div>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className={
            "px-3 py-1.5 rounded text-sm font-semibold " +
            (busy
              ? "bg-[color:var(--border)] text-[color:var(--muted)]"
              : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
          }
        >
          {busy ? "Speichere …" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  big,
}: {
  label: string;
  value: number | string;
  sub?: string;
  big?: boolean;
}) {
  return (
    <div
      className={
        "border rounded-md px-3 py-2 " +
        (big
          ? "border-[color:var(--brand-orange)]/40 bg-[color:var(--brand-orange)]/5"
          : "border-[color:var(--border)] bg-[color:var(--background)]/50")
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
        {label}
      </div>
      <div
        className={
          "tabular-nums " +
          (big
            ? "text-2xl font-bold text-[color:var(--brand-orange)]"
            : "text-xl font-semibold")
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="text-[11px] text-[color:var(--muted)] mt-0.5">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function computeBedarf(p: Produkt, week: WeekResponse | null): number | null {
  const m = Number(p.menge_pro_einheit);
  switch (p.berechnungs_typ) {
    case "pro_monat":
      return m / 4;
    case "fix_pro_woche":
      return m;
    case "pro_teilnehmer_woche":
      if (!week) return null;
      return m * (week.summe_teilnehmer_unique ?? 0);
    case "pro_teilnehmer_tag":
      if (!week) return null;
      return m * (week.summe_teilnehmer_tage ?? 0);
    case "pro_seminartag":
      if (!week) return null;
      return m * (week.seminartage ?? 0);
  }
}

function nextSaturday(): string {
  const d = new Date();
  // 6 = Saturday
  const days = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + days);
  return iso(d);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(s: string, n: number): string {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}

function fmtDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

function fmtDay(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.` : s;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  const v = Number(n);
  return v.toLocaleString("de-AT", {
    minimumFractionDigits: v % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 3,
  });
}
