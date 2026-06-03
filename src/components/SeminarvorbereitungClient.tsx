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

interface Kategorie {
  id: string;
  name: string;
  sortierung: number;
  aktiv: boolean;
}

interface Produkt {
  id: string;
  name: string;
  einheit: string;
  kategorie_id: string | null;
  sortierung: number;
  aktiv: boolean;
  notiz: string | null;
}

export default function SeminarvorbereitungClient() {
  const [weekStart, setWeekStart] = useState<string>(() => nextSaturday());
  const [week, setWeek] = useState<WeekResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [pLoading, setPLoading] = useState(false);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);

  const loadKategorien = useCallback(async () => {
    try {
      const r = await fetch(`/cashflow/api/seminarmanagement/kategorien`, {
        cache: "no-store",
      });
      const j = (await r.json()) as {
        ok?: boolean;
        kategorien?: Kategorie[];
      };
      if (r.ok && j.ok !== false) setKategorien(j.kategorien ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadKategorien();
  }, [loadKategorien]);

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
        kategorien={kategorien}
        loading={pLoading}
        onReload={loadProdukte}
        onKatReload={loadKategorien}
      />

      {/* Lieferanten */}
      <LieferantenSection kategorien={kategorien} />
    </div>
  );
}

interface Lieferant {
  id: string;
  name: string;
  telefon: string | null;
  email: string | null;
  notiz: string | null;
  aktiv: boolean;
  kategorie_ids: string[];
}

function LieferantenSection({ kategorien }: { kategorien: Kategorie[] }) {
  const [lieferanten, setLieferanten] = useState<Lieferant[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/cashflow/api/seminarmanagement/lieferanten`, {
        cache: "no-store",
      });
      const j = (await r.json()) as {
        ok?: boolean;
        lieferanten?: Lieferant[];
      };
      if (r.ok && j.ok !== false) setLieferanten(j.lieferanten ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold">Lieferanten</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs px-2.5 py-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30"
        >
          {adding ? "Schließen" : "+ Lieferant"}
        </button>
      </div>

      {adding ? (
        <LieferantForm
          kategorien={kategorien}
          onSuccess={() => {
            setAdding(false);
            load();
          }}
        />
      ) : null}

      {loading ? (
        <div className="text-xs text-[color:var(--muted)] py-4 text-center">
          Lade Lieferanten …
        </div>
      ) : lieferanten.length === 0 ? (
        <div className="text-xs text-[color:var(--muted)] py-4 text-center">
          Noch keine Lieferanten angelegt.
        </div>
      ) : (
        <div className="space-y-2">
          {lieferanten.map((l) => (
            <LieferantRow
              key={l.id}
              lieferant={l}
              kategorien={kategorien}
              onReload={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LieferantRow({
  lieferant,
  kategorien,
  onReload,
}: {
  lieferant: Lieferant;
  kategorien: Kategorie[];
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const katNames = useMemo(
    () =>
      lieferant.kategorie_ids
        .map((id) => kategorien.find((k) => k.id === id)?.name)
        .filter(Boolean)
        .join(", "),
    [lieferant.kategorie_ids, kategorien],
  );
  return (
    <div className="border border-[color:var(--border)] rounded-md">
      {editing ? (
        <LieferantForm
          lieferant={lieferant}
          kategorien={kategorien}
          onSuccess={() => {
            setEditing(false);
            onReload();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 px-3 py-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{lieferant.name}</div>
            <div className="text-[11px] text-[color:var(--muted)] mt-0.5">
              {lieferant.email ? (
                <a
                  href={`mailto:${lieferant.email}`}
                  className="text-[color:var(--brand-blue)] hover:underline mr-3"
                >
                  {lieferant.email}
                </a>
              ) : null}
              {lieferant.telefon ? (
                <a
                  href={`tel:${lieferant.telefon}`}
                  className="text-[color:var(--brand-blue)] hover:underline"
                >
                  {lieferant.telefon}
                </a>
              ) : null}
            </div>
            {katNames ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {lieferant.kategorie_ids.map((kid) => {
                  const k = kategorien.find((x) => x.id === kid);
                  if (!k) return null;
                  return (
                    <span
                      key={kid}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold"
                    >
                      {k.name}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-amber-700 mt-1">
                Keine Kategorie zugewiesen
              </div>
            )}
            {lieferant.notiz ? (
              <div className="text-[11px] text-[color:var(--muted)] mt-1">
                {lieferant.notiz}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] px-2 py-0.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30 font-semibold"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={async () => {
                if (
                  !confirm(`Lieferant "${lieferant.name}" loeschen?`)
                )
                  return;
                await fetch(
                  `/cashflow/api/seminarmanagement/lieferanten/${lieferant.id}`,
                  { method: "DELETE" },
                );
                onReload();
              }}
              className="text-[11px] px-2 py-0.5 rounded border border-red-300 text-red-700 hover:bg-red-50 font-semibold"
            >
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LieferantForm({
  lieferant,
  kategorien,
  onSuccess,
  onCancel,
}: {
  lieferant?: Lieferant;
  kategorien: Kategorie[];
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!lieferant;
  const [name, setName] = useState(lieferant?.name ?? "");
  const [email, setEmail] = useState(lieferant?.email ?? "");
  const [telefon, setTelefon] = useState(lieferant?.telefon ?? "");
  const [notiz, setNotiz] = useState(lieferant?.notiz ?? "");
  const [kids, setKids] = useState<Set<string>>(
    new Set(lieferant?.kategorie_ids ?? []),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleKat(id: string) {
    setKids((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit() {
    setErr(null);
    if (!name.trim()) {
      setErr("Name Pflicht");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        email: email.trim() || null,
        telefon: telefon.trim() || null,
        notiz: notiz.trim() || null,
        kategorie_ids: [...kids],
      };
      const url = isEdit
        ? `/cashflow/api/seminarmanagement/lieferanten/${lieferant!.id}`
        : `/cashflow/api/seminarmanagement/lieferanten`;
      const r = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    <div className="p-3 bg-[color:var(--brand-yellow)]/5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        />
        <input
          type="email"
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        />
        <input
          type="tel"
          placeholder="Telefon"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        />
      </div>
      <input
        placeholder="Notiz (optional)"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
        className="mt-2 w-full border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
      />
      {kategorien.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-[color:var(--muted)] mb-1.5">
            Kategorien zuweisen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {kategorien.map((k) => {
              const on = kids.has(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => toggleKat(k.id)}
                  className={
                    "text-[11px] px-2 py-1 rounded border font-semibold " +
                    (on
                      ? "bg-[color:var(--brand-orange)] text-white border-[color:var(--brand-orange)]"
                      : "border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30")
                  }
                >
                  {on ? "✓ " : ""}
                  {k.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {err ? <div className="mt-2 text-xs text-red-700">{err}</div> : null}
      <div className="mt-3 flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 rounded text-sm border border-[color:var(--border)]"
          >
            Abbrechen
          </button>
        ) : null}
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
          {busy ? "Speichere …" : isEdit ? "Speichern" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

function ProdukteSection({
  produkte,
  kategorien,
  loading,
  onReload,
  onKatReload,
}: {
  produkte: Produkt[];
  kategorien: Kategorie[];
  loading: boolean;
  onReload: () => void;
  onKatReload: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [managingKat, setManagingKat] = useState(false);

  // Gruppiere Produkte nach Kategorie
  const gruppiert = useMemo(() => {
    const m = new Map<string | null, Produkt[]>();
    for (const p of produkte) {
      const k = p.kategorie_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [produkte]);

  const sortedKategorien = useMemo(
    () => [...kategorien].sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name)),
    [kategorien],
  );

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold">Produkte</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManagingKat((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30"
          >
            {managingKat ? "Kategorien schließen" : "Kategorien verwalten"}
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--brand-yellow)]/30"
          >
            {adding ? "Schließen" : "+ Produkt"}
          </button>
        </div>
      </div>

      {managingKat ? (
        <KategorienManager
          kategorien={sortedKategorien}
          onReload={onKatReload}
        />
      ) : null}

      {adding ? (
        <AddProduktForm
          kategorien={sortedKategorien}
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
        <div className="space-y-4">
          {sortedKategorien.map((kat) => {
            const ps = gruppiert.get(kat.id) ?? [];
            if (ps.length === 0) return null;
            return (
              <ProduktGruppe
                key={kat.id}
                title={kat.name}
                produkte={ps}
                onReload={onReload}
              />
            );
          })}
          {/* Ohne Kategorie */}
          {gruppiert.has(null) ? (
            <ProduktGruppe
              title="Ohne Kategorie"
              produkte={gruppiert.get(null) ?? []}
              onReload={onReload}
              muted
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProduktGruppe({
  title,
  produkte,
  onReload,
  muted,
}: {
  title: string;
  produkte: Produkt[];
  onReload: () => void;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "opacity-70" : ""}>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-[color:var(--muted)] mb-1.5">
        {title} <span className="text-[10px]">({produkte.length})</span>
      </div>
      <div className="border border-[color:var(--border)] rounded divide-y divide-[color:var(--border)]/60">
        {produkte.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              {p.notiz ? (
                <div className="text-[11px] text-[color:var(--muted)] truncate">
                  {p.notiz}
                </div>
              ) : null}
            </div>
            <div className="text-xs text-[color:var(--muted)] whitespace-nowrap">
              {p.einheit}
            </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}

function KategorienManager({
  kategorien,
  onReload,
}: {
  kategorien: Kategorie[];
  onReload: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  async function addKat() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await fetch(`/cashflow/api/seminarmanagement/kategorien`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          sortierung: 100,
        }),
      });
      setNewName("");
      onReload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="border border-[color:var(--border)] rounded-md p-3 mb-4 bg-[color:var(--brand-yellow)]/5">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-[color:var(--muted)] mb-2">
        Kategorien
      </div>
      <div className="space-y-1 mb-3">
        {kategorien.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between gap-2 text-sm bg-white border border-[color:var(--border)] rounded px-2 py-1"
          >
            <span>{k.name}</span>
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Kategorie "${k.name}" loeschen?`)) return;
                await fetch(
                  `/cashflow/api/seminarmanagement/kategorien/${k.id}`,
                  { method: "DELETE" },
                );
                onReload();
              }}
              className="text-[11px] text-red-700 hover:underline"
            >
              löschen
            </button>
          </div>
        ))}
        {kategorien.length === 0 ? (
          <div className="text-xs text-[color:var(--muted)]">
            Keine Kategorien angelegt.
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input
          placeholder="Neue Kategorie"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={addKat}
          disabled={busy || !newName.trim()}
          className={
            "px-3 py-1.5 rounded text-sm font-semibold " +
            (busy || !newName.trim()
              ? "bg-[color:var(--border)] text-[color:var(--muted)]"
              : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
          }
        >
          +
        </button>
      </div>
    </div>
  );
}

function AddProduktForm({
  kategorien,
  onSuccess,
}: {
  kategorien: Kategorie[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [einheit, setEinheit] = useState("Stk");
  const [kategorieId, setKategorieId] = useState<string>(
    kategorien[0]?.id ?? "",
  );
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!name.trim() || !einheit.trim()) {
      setErr("Name + Einheit Pflicht");
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
          kategorie_id: kategorieId || null,
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          placeholder="Name (z. B. Bananen)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm sm:col-span-2"
        />
        <input
          placeholder="Einheit (kg, L, Stk)"
          value={einheit}
          onChange={(e) => setEinheit(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        />
        <select
          value={kategorieId}
          onChange={(e) => setKategorieId(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
        >
          <option value="">— keine Kategorie —</option>
          {kategorien.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
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

function nextSaturday(): string {
  const d = new Date();
  // 6 = Saturday
  const days = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + days);
  return isoLocal(d);
}

/** YYYY-MM-DD im LOKAL-TZ -- vermeidet UTC-Shift. */
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(s: string, n: number): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    12, // 12:00 lokal -- vermeidet DST-Edgecase
    0,
    0,
  );
  d.setDate(d.getDate() + n);
  return isoLocal(d);
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
