"use client";

/**
 * Angebots-Notiz-Generator (Standalone-Seite /notiz)
 * --------------------------------------------------
 * Erstellt eine Plain-Text-Notiz fuer das Sales-Angebot (vor
 * Vertragsannahme). Wird per Email manuell versendet, NICHT
 * direkt an SimplyOrg.
 *
 * Output-Format (wie Slack-Notiz heute):
 *
 *   1. Mentalcoach online ueber 11 Wochen vom 02.07.2026 - 17.09.2026
 *   2. NLP Practitioner in Wien an 4 Wochenenden:
 *      Modul 1: 26.-27. September 2026
 *      Modul 2: 10.-11. Oktober 2026
 *      ...
 *   3. Mentoring (tbd ob Praesenz oder online) ab Anfang 2027
 *
 * Datenquellen: /api/bot/* (Server-Proxy zum Mac-Mini-Bot).
 */

import { useEffect, useMemo, useState } from "react";
import { botUrl } from "@/lib/bot-client";

interface Article {
  id: number;
  title: string;
  price?: number | null;
}

interface Reihe {
  qualification_id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface Termin {
  event_id: number;
  name: string;
  start_date: string;
  end_date: string;
  location?: string;
}

interface Hauptprodukt {
  name: string;
  preis_default: number | null;
  anzahl_rechnungen: number;
}

interface Vorschlag {
  name: string;
  typ: "seminar" | "artikel";
  quote: number;
}

type ZeileKind = "seminar" | "reihe" | "artikel";

interface Zeile {
  uid: string;
  kind: ZeileKind | "";
  modelId: number | null;
  // Sales-Name: was in der Notiz auftaucht (was Mario tippt, NICHT
  // der SimplyOrg-Katalog-Name -- den merken wir uns separat)
  salesName: string;
  // SimplyOrg-Zielname (informativ, fuer spaetere Rechnung)
  catalogTitle: string;
  termine: Termin[];
  ladeTermine: boolean;
  // UI-State: Suche
  searchResults: (Article | Reihe)[];
  searching: boolean;
  // Termin-Anzeige-Format: 'range' (eine Range) oder 'liste' (jede
  // Termin-Sub-Zeile einzeln, mit "Modul N:"-Prefix)
  terminFormat: "range" | "liste" | "keine";
  // Optionaler Praefix-Text vor Datums-Range
  praefixText: string;
  // Optionales Suffix nach dem Eintrag
  freitext: string;
}

function newUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function leereZeile(): Zeile {
  return {
    uid: newUid(),
    kind: "",
    modelId: null,
    salesName: "",
    catalogTitle: "",
    termine: [],
    ladeTermine: false,
    searchResults: [],
    searching: false,
    terminFormat: "range",
    praefixText: "",
    freitext: "",
  };
}

// --- Date helpers ---------------------------------------------------
const MONATE_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function parseISO(d: string): { day: number; month: number; year: number } | null {
  const m = (d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Format TT.MM.JJJJ -- Mario's Standard-Notiz-Format (zero-padded)
function fmtDateDE(iso: string): string {
  const p = parseISO(iso);
  if (!p) return iso;
  return `${pad(p.day)}.${pad(p.month)}.${p.year}`;
}

function fmtRangeDE(start: string, end: string): string {
  if (!end || start === end) return fmtDateDE(start);
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return `${fmtDateDE(start)} - ${fmtDateDE(end)}`;
  // gleicher Monat + Jahr: "26.-27. September 2026"
  if (a.month === b.month && a.year === b.year) {
    return `${a.day}.-${b.day}. ${MONATE_DE[a.month - 1]} ${a.year}`;
  }
  // sonst beide voll qualifiziert: "02.07.2026 - 17.09.2026"
  return `${fmtDateDE(start)} - ${fmtDateDE(end)}`;
}

// --- Notiz-Generator (Hauptarbeit) ---------------------------------
function buildNotiz(zeilen: Zeile[]): string {
  const lines: string[] = [];
  let n = 1;
  for (const z of zeilen) {
    if (!z.kind || !z.salesName.trim()) continue;
    const head = z.salesName.trim();
    const prefix = z.praefixText.trim();
    const freitext = z.freitext.trim();
    const termine = z.termine || [];

    // Termin-Darstellung
    let zeilenText = "";
    if (z.terminFormat === "keine" || termine.length === 0) {
      // Artikel ohne Termin
      zeilenText = `${n}. ${head}`;
      if (freitext) zeilenText += ` ${freitext}`;
    } else if (z.terminFormat === "range") {
      // Eine Range: "Name vom <start> - <end>" oder ohne "vom" wenn prefix gesetzt
      const first = termine[0];
      const last = termine[termine.length - 1];
      const range = fmtRangeDE(first.start_date, last.end_date || last.start_date);
      const verb = prefix || "vom";
      zeilenText = `${n}. ${head} ${verb} ${range}`;
      if (freitext) zeilenText += ` ${freitext}`;
    } else {
      // Liste: jedes Termin-Event als Sub-Zeile mit Modul-Praefix
      const headLine = freitext
        ? `${n}. ${head}${prefix ? " " + prefix : ""} ${freitext}`
        : `${n}. ${head}${prefix ? " " + prefix : ""}`;
      lines.push(headLine.endsWith(":") ? headLine : headLine + ":");
      termine.forEach((t, i) => {
        const r = fmtRangeDE(t.start_date, t.end_date || t.start_date);
        lines.push(`   Modul ${i + 1}: ${r}`);
      });
      n++;
      continue;
    }
    lines.push(zeilenText);
    n++;
  }
  return lines.join("\n");
}

// --- Komponente -----------------------------------------------------
export default function NotizGenerator() {
  const [hauptprodukte, setHauptprodukte] = useState<Hauptprodukt[]>([]);
  const [hauptprodukt, setHauptprodukt] = useState<string>("");
  const [hauptpreis, setHauptpreis] = useState<string>("");
  const [vorschlaege, setVorschlaege] = useState<{
    pflicht: Vorschlag[];
    haeufig: Vorschlag[];
    gelegentlich: Vorschlag[];
  } | null>(null);
  const [vorschlaegeLaden, setVorschlaegeLaden] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  // Output-Logik: standardmaessig wird der Text aus den Zeilen
  // generiert. Wenn Mario direkt im Textarea editiert, wird der
  // Edit in 'customNotiz' gespeichert (override). 'Notiz neu
  // generieren' setzt das zurueck.
  const computedNotiz = useMemo(() => buildNotiz(zeilen), [zeilen]);
  const [customNotiz, setCustomNotiz] = useState<string | null>(null);
  const notizText = customNotiz ?? computedNotiz;
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);

  // Hauptprodukte beim Mount laden
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(botUrl("hauptprodukte"));
        if (r.status === 401) {
          setLadeFehler("Login abgelaufen — bitte erneut anmelden.");
          return;
        }
        if (r.status === 403) {
          setLadeFehler(
            "Rechnungs-Bot ist nicht freigeschaltet für deinen Account (Beta).",
          );
          return;
        }
        if (r.status === 502) {
          setLadeFehler(
            "Bot nicht erreichbar (Cloudflare-Tunnel offline?). Starte das Helper-Skript auf dem Mac Mini neu.",
          );
          return;
        }
        const j = await r.json();
        setHauptprodukte(j.data ?? []);
      } catch (e) {
        setLadeFehler(
          `Fehler beim Laden der Hauptprodukte: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    })();
  }, []);

  async function selectHauptprodukt(name: string) {
    setHauptprodukt(name);
    const hp = hauptprodukte.find((h) => h.name === name);
    if (hp?.preis_default != null) setHauptpreis(String(hp.preis_default));
    if (!name) {
      setVorschlaege(null);
      return;
    }
    setVorschlaegeLaden(true);
    setVorschlaege(null);
    try {
      const r = await fetch(
        `${botUrl("hauptprodukt")}/${encodeURIComponent(name)}?min_quote=0.4`,
      );
      const j = await r.json();
      if (j.error) {
        console.warn("vorschlaege", j.error);
        return;
      }
      const next = {
        pflicht: (j.pflicht ?? []) as Vorschlag[],
        haeufig: (j.haeufig ?? []) as Vorschlag[],
        gelegentlich: (j.gelegentlich ?? []) as Vorschlag[],
      };
      setVorschlaege(next);
      // Pflicht-Vorschläge direkt als Zeilen anlegen
      if (next.pflicht.length > 0) {
        setZeilen(next.pflicht.map((v) => vorschlagZuZeile(v)));
      }
    } catch (e) {
      console.error("vorschlag", e);
    } finally {
      setVorschlaegeLaden(false);
    }
  }

  function vorschlagZuZeile(v: Vorschlag): Zeile {
    const z = leereZeile();
    z.kind = v.typ === "seminar" ? "reihe" : "artikel";
    z.salesName = v.name;
    z.catalogTitle = v.name;
    z.terminFormat = v.typ === "seminar" ? "range" : "keine";
    return z;
  }

  function addZeile(vorschlag?: Vorschlag) {
    setZeilen((prev) => [
      ...prev,
      vorschlag ? vorschlagZuZeile(vorschlag) : leereZeile(),
    ]);
  }

  function removeZeile(uid: string) {
    setZeilen((prev) => prev.filter((z) => z.uid !== uid));
  }

  function moveZeile(uid: string, dir: -1 | 1) {
    setZeilen((prev) => {
      const i = prev.findIndex((z) => z.uid === uid);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function updateZeile(uid: string, patch: Partial<Zeile>) {
    setZeilen((prev) =>
      prev.map((z) => (z.uid === uid ? { ...z, ...patch } : z)),
    );
  }

  async function searchZeile(uid: string, q: string, kind: ZeileKind) {
    if (q.trim().length < 2) {
      updateZeile(uid, { searchResults: [], searching: false });
      return;
    }
    updateZeile(uid, { searching: true });
    try {
      const endpoint =
        kind === "artikel" ? botUrl("articles") : botUrl("seminare");
      const r = await fetch(endpoint);
      const j = await r.json();
      const data: (Article | Reihe)[] = j.data ?? [];
      const lq = q.toLowerCase();
      const hits = data
        .filter((x) => {
          const name =
            "title" in x ? (x as Article).title : (x as Reihe).name;
          return name.toLowerCase().includes(lq);
        })
        .slice(0, 20);
      updateZeile(uid, { searchResults: hits, searching: false });
    } catch (e) {
      console.error("search", e);
      updateZeile(uid, { searching: false });
    }
  }

  function pickSearchHit(uid: string, hit: Article | Reihe) {
    const z = zeilen.find((x) => x.uid === uid);
    if (!z) return;
    if (z.kind === "artikel") {
      const a = hit as Article;
      updateZeile(uid, {
        modelId: a.id,
        catalogTitle: a.title,
        // salesName: nur initial-fuellen wenn Mario noch nichts editiert hat
        salesName: z.salesName.trim() || a.title,
        searchResults: [],
      });
    } else {
      const r = hit as Reihe;
      updateZeile(uid, {
        modelId: r.qualification_id,
        catalogTitle: r.name,
        salesName: z.salesName.trim() || r.name,
        searchResults: [],
      });
      void loadTermine(uid, r.qualification_id);
    }
  }

  async function loadTermine(uid: string, qid: number) {
    updateZeile(uid, { ladeTermine: true });
    try {
      const r = await fetch(`${botUrl("seminare")}/${qid}/termine`);
      const j = await r.json();
      const termine: Termin[] = j.data ?? [];
      // Format-Heuristik: 1 Termin -> 'range', 2-10 Termine -> 'liste'
      // (Modul-Sub-Zeilen), 0 -> 'keine'
      const fmt: Zeile["terminFormat"] =
        termine.length === 0 ? "keine" :
        termine.length === 1 ? "range" : "liste";
      updateZeile(uid, { termine, ladeTermine: false, terminFormat: fmt });
    } catch (e) {
      console.error("termine", e);
      updateZeile(uid, { ladeTermine: false });
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(notizText);
      setCopyStatus("✓ Kopiert!");
      setTimeout(() => setCopyStatus(""), 2000);
    } catch {
      setCopyStatus("Kopieren fehlgeschlagen — bitte manuell markieren.");
      setTimeout(() => setCopyStatus(""), 4000);
    }
  }

  if (ladeFehler) {
    return (
      <div className="p-4 rounded bg-red-50 text-red-800 text-sm">
        ❌ {ladeFehler}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Angebots-Notiz erstellen</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Für die Angebots-Email (vor Vertragsannahme). Generiert
          eine nummerierte Plain-Text-Notiz aus Hauptprodukt + Positionen.
        </p>
      </div>

      {/* --- Hauptprodukt --- */}
      <section className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-lg p-4">
        <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-2">
          Hauptprodukt
        </label>
        <div className="flex gap-2">
          <select
            value={hauptprodukt}
            onChange={(e) => selectHauptprodukt(e.target.value)}
            className="flex-1 border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
          >
            <option value="">— wählen —</option>
            {hauptprodukte.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name}
                {h.preis_default != null
                  ? ` (${h.preis_default.toLocaleString("de-AT")} €, ${h.anzahl_rechnungen}×)`
                  : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={hauptpreis}
            onChange={(e) => setHauptpreis(e.target.value)}
            placeholder="Preis"
            className="w-28 border border-[color:var(--border)] rounded px-2 py-1.5 text-sm text-right tabular-nums"
          />
          <span className="text-sm self-center text-[color:var(--muted)]">€</span>
        </div>
        {vorschlaegeLaden ? (
          <p className="text-xs text-[color:var(--muted)] mt-2">
            Lade Vorschläge…
          </p>
        ) : null}
        {vorschlaege && (vorschlaege.haeufig.length > 0 || vorschlaege.gelegentlich.length > 0) ? (
          <div className="mt-3 text-xs">
            <div className="text-[color:var(--muted)] mb-1">
              Weitere Vorschläge laut Handbuch:
            </div>
            {vorschlaege.haeufig.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => addZeile(v)}
                className="inline-block mr-1 mb-1 px-2 py-0.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--brand-blue)]/10"
                title={`${(v.quote * 100).toFixed(0)}% — ${v.typ}`}
              >
                + {v.name}
              </button>
            ))}
            {vorschlaege.gelegentlich.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => addZeile(v)}
                className="inline-block mr-1 mb-1 px-2 py-0.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--brand-blue)]/10 opacity-60"
                title={`${(v.quote * 100).toFixed(0)}% — ${v.typ}`}
              >
                + {v.name}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* --- Positionen --- */}
      <section className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)]">
            Positionen ({zeilen.length})
          </label>
          <button
            type="button"
            onClick={() => addZeile()}
            className="text-xs px-3 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
          >
            + Position
          </button>
        </div>
        {zeilen.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)] italic">
            Wähle ein Hauptprodukt oder klicke „+ Position“ um manuell zu beginnen.
          </p>
        ) : null}
        <div className="space-y-3">
          {zeilen.map((z, idx) => (
            <ZeileEditor
              key={z.uid}
              idx={idx + 1}
              zeile={z}
              first={idx === 0}
              last={idx === zeilen.length - 1}
              onUpdate={(patch) => updateZeile(z.uid, patch)}
              onRemove={() => removeZeile(z.uid)}
              onMove={(dir) => moveZeile(z.uid, dir)}
              onSearch={(q, k) => searchZeile(z.uid, q, k)}
              onPickHit={(hit) => pickSearchHit(z.uid, hit)}
            />
          ))}
        </div>
      </section>

      {/* --- Notiz-Vorschau --- */}
      <section className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)]">
            Notiz-Vorschau (Plain-Text, für die Email)
          </label>
          <div className="flex items-center gap-2">
            {copyStatus ? (
              <span className="text-xs text-[color:var(--brand-blue)]">
                {copyStatus}
              </span>
            ) : null}
            {customNotiz !== null ? (
              <button
                type="button"
                onClick={() => setCustomNotiz(null)}
                className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
                title="Setzt den Text zurueck auf den generierten Inhalt aus den Positionen"
              >
                Neu generieren
              </button>
            ) : null}
            <button
              type="button"
              onClick={copyToClipboard}
              disabled={!notizText.trim()}
              className="text-xs px-3 py-1 rounded bg-[color:var(--brand-blue)] text-white disabled:opacity-50"
            >
              In Zwischenablage kopieren
            </button>
          </div>
        </div>
        <textarea
          value={notizText}
          onChange={(e) => setCustomNotiz(e.target.value)}
          rows={Math.max(6, (notizText.match(/\n/g)?.length ?? 0) + 2)}
          className="w-full border border-[color:var(--border)] rounded px-3 py-2 text-sm font-mono whitespace-pre"
          placeholder="(Notiz erscheint hier, sobald du Positionen ausgewählt hast)"
        />
        <p className="text-xs text-[color:var(--muted)] mt-1">
          {customNotiz !== null
            ? "Manuell editiert. „Neu generieren“ verwirft Änderungen und übernimmt wieder die Positionen."
            : "Du kannst direkt im Feld editieren — die Änderungen werden nicht in die Positionen zurückgeschrieben."}
        </p>
      </section>
    </div>
  );
}

// --- Sub-Komponente: eine Zeile ------------------------------------
interface ZeileProps {
  idx: number;
  zeile: Zeile;
  first: boolean;
  last: boolean;
  onUpdate: (patch: Partial<Zeile>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onSearch: (q: string, kind: ZeileKind) => void;
  onPickHit: (hit: Article | Reihe) => void;
}

function ZeileEditor({
  idx,
  zeile,
  first,
  last,
  onUpdate,
  onRemove,
  onMove,
  onSearch,
  onPickHit,
}: ZeileProps) {
  const isReihe = zeile.kind === "reihe";
  const isArtikel = zeile.kind === "artikel";
  const isPicked = zeile.modelId != null;
  return (
    <div className="border border-[color:var(--border)] rounded p-3 bg-[color:var(--background)]">
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
          Pos {idx}
          {isReihe ? " · Seminar/Reihe" : isArtikel ? " · Artikel" : ""}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            className="text-xs px-1.5 py-0.5 rounded border border-[color:var(--border)] disabled:opacity-30"
            title="Nach oben"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            className="text-xs px-1.5 py-0.5 rounded border border-[color:var(--border)] disabled:opacity-30"
            title="Nach unten"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-[color:var(--brand-orange)] hover:underline ml-2"
          >
            Entfernen
          </button>
        </div>
      </div>

      {/* Kind-Toggle */}
      {!zeile.kind ? (
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => onUpdate({ kind: "artikel", terminFormat: "keine" })}
            className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
          >
            Artikel (kein Termin)
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ kind: "reihe", terminFormat: "range" })}
            className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
          >
            Seminar / Reihe
          </button>
        </div>
      ) : null}

      {/* Sales-Name (was in der Notiz erscheint) */}
      {zeile.kind ? (
        <div className="mb-2">
          <label className="block text-xs text-[color:var(--muted)] mb-0.5">
            Anzeige in der Notiz
          </label>
          <div className="relative">
            <input
              type="text"
              value={zeile.salesName}
              onChange={(e) => {
                const v = e.target.value;
                onUpdate({ salesName: v });
                onSearch(v, zeile.kind as ZeileKind);
              }}
              placeholder={
                zeile.kind === "artikel"
                  ? "z.B. „Selbsterfahrung 5 in Wien (1 Woche im Jahr 2028)“"
                  : "z.B. „Mentalcoach online über 11 Wochen“"
              }
              className="w-full border border-[color:var(--border)] rounded px-2 py-1 text-sm"
            />
            {zeile.searching ? (
              <div className="absolute right-2 top-1 text-xs text-[color:var(--muted)]">…</div>
            ) : null}
            {zeile.searchResults.length > 0 && !isPicked ? (
              <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[color:var(--surface)] border border-[color:var(--border)] rounded shadow-lg">
                {zeile.searchResults.map((h) => {
                  const id =
                    "id" in h ? (h as Article).id : (h as Reihe).qualification_id;
                  const label =
                    "title" in h ? (h as Article).title : (h as Reihe).name;
                  const sub =
                    "id" in h
                      ? `Artikel #${(h as Article).id}`
                      : `Reihe #${(h as Reihe).qualification_id} · ${(h as Reihe).start_date}–${(h as Reihe).end_date}`;
                  return (
                    <button
                      type="button"
                      key={id}
                      onClick={() => onPickHit(h)}
                      className="block w-full text-left text-sm px-2 py-1 hover:bg-[color:var(--brand-blue)]/10 border-b border-[color:var(--border)] last:border-b-0"
                    >
                      {label}
                      <span className="text-xs text-[color:var(--muted)] block">
                        {sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {isPicked && zeile.catalogTitle ? (
            <div className="text-xs text-[color:var(--brand-blue)] mt-0.5">
              ↳ Zugeordnet zu SimplyOrg-{isReihe ? "Reihe" : "Artikel"}:
              {" "}
              {zeile.catalogTitle} (#{zeile.modelId})
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Termin-Format (nur bei Reihe) */}
      {isReihe && isPicked ? (
        <div className="mb-2 flex items-center gap-3 text-xs">
          <label className="text-[color:var(--muted)]">Termin-Darstellung:</label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`tf-${zeile.uid}`}
              checked={zeile.terminFormat === "range"}
              onChange={() => onUpdate({ terminFormat: "range" })}
            />
            Gesamt-Zeitraum
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`tf-${zeile.uid}`}
              checked={zeile.terminFormat === "liste"}
              onChange={() => onUpdate({ terminFormat: "liste" })}
            />
            Pro Modul auflisten
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`tf-${zeile.uid}`}
              checked={zeile.terminFormat === "keine"}
              onChange={() => onUpdate({ terminFormat: "keine" })}
            />
            Ohne Termin
          </label>
          {zeile.ladeTermine ? (
            <span className="text-[color:var(--muted)]">
              (Lade Termine…)
            </span>
          ) : (
            <span className="text-[color:var(--muted)]">
              ({zeile.termine.length} Termine geladen)
            </span>
          )}
        </div>
      ) : null}

      {/* Praefix-Text */}
      {isPicked && zeile.terminFormat !== "keine" ? (
        <div className="mb-2 flex items-center gap-2 text-xs">
          <label className="text-[color:var(--muted)] min-w-[110px]">
            Praefix vor Datum
          </label>
          <input
            type="text"
            value={zeile.praefixText}
            onChange={(e) => onUpdate({ praefixText: e.target.value })}
            placeholder={
              zeile.terminFormat === "range"
                ? "vom (default)"
                : "an 4 Wochenenden, jeweils von 9-18 Uhr"
            }
            className="flex-1 border border-[color:var(--border)] rounded px-2 py-0.5 text-sm"
          />
        </div>
      ) : null}

      {/* Freitext-Suffix */}
      <div className="flex items-center gap-2 text-xs">
        <label className="text-[color:var(--muted)] min-w-[110px]">
          Zusatz-Text
        </label>
        <input
          type="text"
          value={zeile.freitext}
          onChange={(e) => onUpdate({ freitext: e.target.value })}
          placeholder="z.B. „ab Anfang 2027“ oder „(tbd ob Präsenz oder online)“"
          className="flex-1 border border-[color:var(--border)] rounded px-2 py-0.5 text-sm"
        />
      </div>
    </div>
  );
}
