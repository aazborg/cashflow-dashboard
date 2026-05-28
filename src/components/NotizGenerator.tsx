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
import VorlagenBrowser from "./VorlagenBrowser";

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

interface VorlageListEntry {
  id: string;
  email: string;
  name: string | null;
  hauptprodukt: string | null;
  rechnungstitel: string | null;
  notiz_text: string | null;
  rechnung_id: number | null;
  created_at: string;
}

interface VorlageFull {
  id: string;
  email: string;
  name: string | null;
  hauptprodukt: string | null;
  rechnungstitel: string | null;
  positionen: Zeile[];
  notiz_text: string | null;
  rechnung_id: number | null;
  rechnung_created_at: string | null;
  created_at: string;
  updated_at: string;
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
  // ALLE Termine der SimplyOrg-Reihe (von der API geladen)
  termine: Termin[];
  ladeTermine: boolean;
  // event_ids der vom User AUSGEWAEHLTEN Termine. Nur diese erscheinen
  // in der Notiz UND landen spaeter als planned_event_ids in der
  // SimplyOrg-Rechnung (Auto-Einbuchung).
  selectedTerminIds: number[];
  // "Termine bekannt" -- wenn false, wird gar kein Datum gerendert
  // (auch wenn termine geladen sind).
  terminBekannt: boolean;
  // UI-State: Suche
  searchResults: (Article | Reihe)[];
  searching: boolean;
  // Format fuer die Darstellung der AUSGEWAEHLTEN Termine:
  //   'range' -> "vom <erster.start> - <letzter.end>"
  //   'liste' -> "Modul 1: <date>" pro Termin als Sub-Zeile
  terminFormat: "range" | "liste";
  // Optionaler Praefix-Text vor Datums-Range
  praefixText: string;
  // Optionales Suffix nach dem Eintrag
  freitext: string;
  // UI: ist die Zeile aufgeklappt? Auto-Suggests starten eingeklappt,
  // manuelle/neue Zeilen aufgeklappt.
  collapsed: boolean;
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
    selectedTerminIds: [],
    terminBekannt: false,
    searchResults: [],
    searching: false,
    terminFormat: "range",
    praefixText: "",
    freitext: "",
    collapsed: false,  // neu/manuell -> direkt aufgeklappt
  };
}

// --- Date helpers ---------------------------------------------------
const MONATE_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
// Kurz-Wochentage in der ueblichen DE-Schreibweise.
// JS Date.getDay(): 0=Sonntag .. 6=Samstag
const WOCHENTAG_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function parseISO(d: string): { day: number; month: number; year: number } | null {
  const m = (d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function wochentag(iso: string): string {
  const p = parseISO(iso);
  if (!p) return "";
  // UTC-Date, damit DST-/Timezone-Drift nicht den Wochentag verschiebt
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return WOCHENTAG_KURZ[d.getUTCDay()];
}

// Format TT.MM.JJJJ -- Mario's Standard-Notiz-Format (zero-padded)
function fmtDateDE(iso: string): string {
  const p = parseISO(iso);
  if (!p) return iso;
  return `${pad(p.day)}.${pad(p.month)}.${p.year}`;
}

// Kompakt mit Wochentag fuer Dropdowns:
//   "Sa, 26.09. – So, 27.09.2026"  bei Range innerhalb gleichem Jahr
//   "Sa, 26.09.2026"               bei Einzeltag
function fmtRangeKompakt(start: string, end: string): string {
  const a = parseISO(start);
  if (!end || end === start || !a) {
    return a ? `${wochentag(start)}, ${fmtDateDE(start)}` : fmtDateDE(start);
  }
  const b = parseISO(end);
  if (!b) return `${fmtDateDE(start)} – ${fmtDateDE(end)}`;
  if (a.year === b.year) {
    return `${wochentag(start)}, ${pad(a.day)}.${pad(a.month)}. – `
      + `${wochentag(end)}, ${pad(b.day)}.${pad(b.month)}.${b.year}`;
  }
  return `${wochentag(start)}, ${fmtDateDE(start)} – `
    + `${wochentag(end)}, ${fmtDateDE(end)}`;
}

// Lesbar fuer die Kunden-Notiz: Wochentage + Monatsname ausgeschrieben.
//   gleicher Monat:   "Sa–So, 26.–27. September 2026"
//   verschieden:      "Sa, 02.07. – Mi, 17.09.2026"
function fmtRangeDE(start: string, end: string): string {
  const a = parseISO(start);
  if (!end || end === start || !a) {
    return a ? `${wochentag(start)}, ${fmtDateDE(start)}` : fmtDateDE(start);
  }
  const b = parseISO(end);
  if (!b) return `${fmtDateDE(start)} – ${fmtDateDE(end)}`;
  if (a.month === b.month && a.year === b.year) {
    return `${wochentag(start)}–${wochentag(end)}, `
      + `${a.day}.–${b.day}. ${MONATE_DE[a.month - 1]} ${a.year}`;
  }
  if (a.year === b.year) {
    return `${wochentag(start)}, ${pad(a.day)}.${pad(a.month)}. – `
      + `${wochentag(end)}, ${pad(b.day)}.${pad(b.month)}.${b.year}`;
  }
  return `${wochentag(start)}, ${fmtDateDE(start)} – `
    + `${wochentag(end)}, ${fmtDateDE(end)}`;
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
    // Nur ausgewaehlte Termine in der Reihenfolge der API
    const aktiveTermine =
      z.terminBekannt
        ? (z.termine || []).filter((t) =>
            z.selectedTerminIds.includes(t.event_id),
          )
        : [];

    let zeilenText = "";
    if (aktiveTermine.length === 0) {
      // Artikel ODER Reihe ohne Termin-Auswahl
      zeilenText = `${n}. ${head}`;
      if (freitext) zeilenText += ` ${freitext}`;
    } else if (z.terminFormat === "range" || aktiveTermine.length === 1) {
      // Eine Range: "Name vom <start> - <end>"
      const first = aktiveTermine[0];
      const last = aktiveTermine[aktiveTermine.length - 1];
      const range = fmtRangeDE(
        first.start_date,
        last.end_date || last.start_date,
      );
      const verb = prefix || "vom";
      zeilenText = `${n}. ${head} ${verb} ${range}`;
      if (freitext) zeilenText += ` ${freitext}`;
    } else {
      // Liste: jeder ausgewaehlte Termin als Bullet-Sub-Zeile.
      // Layout: leere Zeile vor + nach dem Block macht es im
      // Email-Client optisch leichter zu scannen.
      const headLine = freitext
        ? `${n}. ${head}${prefix ? " " + prefix : ""} ${freitext}`
        : `${n}. ${head}${prefix ? " " + prefix : ""}`;
      lines.push(headLine.endsWith(":") ? headLine : headLine + ":");
      aktiveTermine.forEach((t, i) => {
        const r = fmtRangeDE(t.start_date, t.end_date || t.start_date);
        lines.push(`   • Modul ${i + 1}: ${r}`);
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
  // Kunden-Daten (oben im Formular). Email = Lookup-Key fuer Vorlagen
  // und spaeter fuer die Rechnungs-Erstellung (Bot kann via Email die
  // gespeicherte Notiz wieder einspielen).
  const [kundenEmail, setKundenEmail] = useState("");
  const [kundenName, setKundenName] = useState("");
  // Vorlagen-Liste fuer die aktuelle Email (inline-Anzeige)
  const [vorlagen, setVorlagen] = useState<VorlageListEntry[]>([]);
  const [vorlagenLaden, setVorlagenLaden] = useState(false);
  // Vorlagen-Browser-Modal (alle Vorlagen mit Suche)
  const [browserOpen, setBrowserOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");

  const [hauptprodukte, setHauptprodukte] = useState<Hauptprodukt[]>([]);
  const [hauptprodukt, setHauptprodukt] = useState<string>("");
  const [vorschlaege, setVorschlaege] = useState<{
    pflicht: Vorschlag[];
    haeufig: Vorschlag[];
    gelegentlich: Vorschlag[];
  } | null>(null);
  const [vorschlaegeLaden, setVorschlaegeLaden] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  // Optionaler Rechnungs-Titel-Override (wird nur aus Vorlagen gelesen
  // und zurueckgespeichert -- aktuell kein eigenes UI hier, das wird
  // erst beim Rechnungs-Editor relevant).
  const [rechnungstitel, setRechnungstitel] = useState("");
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

  // --- Vorlagen-Lookup --------------------------------------------------
  async function ladeVorlagenFuerEmail(email: string) {
    const lower = email.trim().toLowerCase();
    if (lower.length < 3 || !lower.includes("@")) {
      setVorlagen([]);
      return;
    }
    setVorlagenLaden(true);
    try {
      const r = await fetch(
        `/cashflow/api/notiz-vorlagen?email=${encodeURIComponent(lower)}`,
      );
      const j = await r.json();
      if (Array.isArray(j.data)) {
        setVorlagen(j.data as VorlageListEntry[]);
      } else {
        setVorlagen([]);
      }
    } catch (e) {
      console.error("vorlagen", e);
      setVorlagen([]);
    } finally {
      setVorlagenLaden(false);
    }
  }

  async function ladeVorlage(id: string) {
    setSaveStatus("Lade Vorlage…");
    try {
      const r = await fetch(`/cashflow/api/notiz-vorlagen/${id}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setSaveStatus(`Fehler: ${j.error || r.statusText}`);
        return;
      }
      const v = (await r.json()) as VorlageFull;
      // State aus Vorlage wiederherstellen
      setKundenEmail(v.email);
      setKundenName(v.name || "");
      setHauptprodukt(v.hauptprodukt || "");
      setRechnungstitel(v.rechnungstitel || "");
      // positionen als-ist uebernehmen, aber UI-Felder
      // (searchResults, searching, ladeTermine) defensiv resetten
      const restored: Zeile[] = (Array.isArray(v.positionen) ? v.positionen : [])
        .map((p: Partial<Zeile>) => ({
          ...leereZeile(),
          ...p,
          uid: newUid(),                   // frische UID damit kein React-key-clash
          searchResults: [],
          searching: false,
          ladeTermine: false,
          collapsed: true,                  // beim Laden alles eingeklappt
        }));
      setZeilen(restored);
      setCustomNotiz(null);
      setSaveStatus(`✓ Vorlage vom ${new Date(v.created_at).toLocaleString("de-AT")} geladen`);
      setTimeout(() => setSaveStatus(""), 4000);

      // --- Live-Refresh der Termine ---
      // Eine Vorlage enthaelt einen Termin-Snapshot vom Zeitpunkt
      // des Speicherns. Damit Mario aktuelle Termine sehen und ggf.
      // gegen andere tauschen kann, ziehen wir frische Daten aus
      // SimplyOrg fuer jede Reihe-Position mit modelId.
      for (const z of restored) {
        if (z.kind === "reihe" && z.modelId != null) {
          void refreshTermineFuerZeile(z.uid, z.modelId);
        }
      }
    } catch (e) {
      setSaveStatus(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Live-Refresh: holt aktuelle Reihen-Termine UND behaelt vorhandene
  // selectedTerminIds nur wenn die event_ids noch existieren.
  async function refreshTermineFuerZeile(uid: string, qid: number) {
    setZeilen((prev) =>
      prev.map((x) => (x.uid === uid ? { ...x, ladeTermine: true } : x)),
    );
    try {
      const r = await fetch(`${botUrl("seminare")}/${qid}/termine`);
      const j = await r.json();
      const fresh: Termin[] = j.data ?? [];
      const freshIds = new Set(fresh.map((t) => t.event_id));
      setZeilen((prev) =>
        prev.map((x) => {
          if (x.uid !== uid) return x;
          // selectedTerminIds: nur die behalten, die's noch gibt
          const stillValid = x.selectedTerminIds.filter((id) =>
            freshIds.has(id),
          );
          // Bei alten Vorlagen (vor dem schema-Update) war
          // selectedTerminIds oft leer. Wenn nach Refresh Termine
          // kommen aber keine Auswahl da ist -> alle vor-auswaehlen
          // damit Mario sofort die Liste sieht und einzelne abhaken
          // kann.
          const finalSelected =
            x.selectedTerminIds.length === 0 && fresh.length > 0
              ? fresh.map((t) => t.event_id)
              : stillValid;
          const aktiv = finalSelected.length > 0;
          return {
            ...x,
            termine: fresh,
            ladeTermine: false,
            terminBekannt: aktiv,
            selectedTerminIds: finalSelected,
            // Auto-Format: 1 Termin -> range, mehrere -> liste
            terminFormat:
              finalSelected.length <= 1 ? "range" : x.terminFormat,
          };
        }),
      );
    } catch (e) {
      console.error("refreshTermine", e);
      setZeilen((prev) =>
        prev.map((x) => (x.uid === uid ? { ...x, ladeTermine: false } : x)),
      );
    }
  }

  async function speichereVorlage() {
    if (!kundenEmail.trim().includes("@")) {
      setSaveStatus("Kunden-Email oben eintragen, dann speichern.");
      setTimeout(() => setSaveStatus(""), 4000);
      return;
    }
    if (zeilen.length === 0) {
      setSaveStatus("Mindestens eine Position erforderlich.");
      setTimeout(() => setSaveStatus(""), 4000);
      return;
    }
    setSaveStatus("Speichere…");
    // searchResults/searching/ladeTermine NICHT mitschreiben -- nur Form-Data
    const positionenClean = zeilen.map((z) => {
      const cleaned: Partial<Zeile> = { ...z };
      delete cleaned.searchResults;
      delete cleaned.searching;
      delete cleaned.ladeTermine;
      return cleaned;
    });
    try {
      const r = await fetch(`/cashflow/api/notiz-vorlagen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: kundenEmail.trim(),
          name: kundenName.trim() || null,
          hauptprodukt: hauptprodukt || null,
          rechnungstitel: rechnungstitel || null,
          positionen: positionenClean,
          notiz_text: notizText,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setSaveStatus(`Fehler: ${j.error || r.statusText}`);
        return;
      }
      setSaveStatus("✓ Gespeichert");
      // Liste nachladen damit neue Vorlage erscheint
      void ladeVorlagenFuerEmail(kundenEmail);
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (e) {
      setSaveStatus(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function selectHauptprodukt(name: string) {
    setHauptprodukt(name);
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
    z.collapsed = true; // Auto-Suggest startet eingeklappt
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
        // Such-Term durch Katalog-Name ersetzen. User kann den Text
        // anschliessend frei editieren (z.B. Sales-Sprache fuer die
        // Kunden-Notiz), aber der Default ist der saubere Titel.
        salesName: a.title,
        searchResults: [],
      });
    } else {
      const r = hit as Reihe;
      updateZeile(uid, {
        modelId: r.qualification_id,
        catalogTitle: r.name,
        salesName: r.name,
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
      // Format-Heuristik: 1 Termin -> 'range', mehrere -> 'liste'
      // (Modul-Sub-Zeilen). Default: alle Termine als ausgewaehlt
      // markieren -- User kann einzelne abwaehlen.
      const fmt: Zeile["terminFormat"] =
        termine.length <= 1 ? "range" : "liste";
      updateZeile(uid, {
        termine,
        ladeTermine: false,
        terminFormat: fmt,
        // alle Termine pre-selected, terminBekannt automatisch an
        // sobald >0 Termine geladen werden.
        terminBekannt: termine.length > 0,
        selectedTerminIds: termine.map((t) => t.event_id),
      });
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Angebots-Notiz erstellen</h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Für die Angebots-Email (vor Vertragsannahme). Generiert
            eine nummerierte Plain-Text-Notiz aus Hauptprodukt + Positionen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBrowserOpen(true)}
          className="text-sm px-3 py-1.5 rounded border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/10 shrink-0"
          title="Alle gespeicherten Notizen durchsuchen"
        >
          📚 Vorlagen durchsuchen
        </button>
      </div>

      {/* --- Kunde + Vorlagen --- */}
      <section className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-lg p-4">
        <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-2">
          Kunde
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            type="email"
            value={kundenEmail}
            onChange={(e) => setKundenEmail(e.target.value)}
            onBlur={() => ladeVorlagenFuerEmail(kundenEmail)}
            placeholder="E-Mail (z.B. max@example.com)"
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            value={kundenName}
            onChange={(e) => setKundenName(e.target.value)}
            placeholder="Name (z.B. Max Mustermann)"
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          />
        </div>
        <p className="text-xs text-[color:var(--muted)] mt-1">
          Email = Schlüssel: spätere Rechnungs-Erstellung kann die hier
          gespeicherte Notiz wieder einlesen.
        </p>

        {/* Bestehende Vorlagen für diese Email */}
        {vorlagenLaden ? (
          <div className="mt-3 text-xs text-[color:var(--muted)]">
            Suche Vorlagen…
          </div>
        ) : vorlagen.length > 0 ? (
          <div className="mt-3 p-2 border border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue)]/5 rounded text-sm">
            <div className="text-xs text-[color:var(--muted)] mb-1">
              {vorlagen.length} bestehende{" "}
              {vorlagen.length === 1 ? "Vorlage" : "Vorlagen"} für diese Email:
            </div>
            <div className="space-y-1">
              {vorlagen.slice(0, 5).map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">
                      {v.hauptprodukt || "(kein Hauptprodukt)"}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {" — "}
                      {new Date(v.created_at).toLocaleDateString("de-AT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                      {v.rechnung_id
                        ? ` · Rechnung #${v.rechnung_id} angelegt`
                        : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => ladeVorlage(v.id)}
                    className="text-xs px-2 py-0.5 rounded border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/10 shrink-0"
                  >
                    Laden
                  </button>
                </div>
              ))}
              {vorlagen.length > 5 ? (
                <div className="text-xs text-[color:var(--muted)] italic">
                  + {vorlagen.length - 5} weitere
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* --- Hauptprodukt --- */}
      <section className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-lg p-4">
        <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-2">
          Hauptprodukt
        </label>
        <select
          value={hauptprodukt}
          onChange={(e) => selectHauptprodukt(e.target.value)}
          className="w-full border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
        >
          <option value="">— wählen —</option>
          {hauptprodukte.map((h) => (
            <option key={h.name} value={h.name}>
              {h.name}
              {h.anzahl_rechnungen ? ` (${h.anzahl_rechnungen}× verkauft)` : ""}
            </option>
          ))}
        </select>
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
          <div className="flex items-center gap-1">
            {zeilen.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setZeilen((prev) =>
                      prev.map((z) => ({ ...z, collapsed: true })),
                    )
                  }
                  className="text-xs px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                  title="Alle Positionen einklappen"
                >
                  ▶ Alle
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZeilen((prev) =>
                      prev.map((z) => ({ ...z, collapsed: false })),
                    )
                  }
                  className="text-xs px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                  title="Alle Positionen ausklappen"
                >
                  ▼ Alle
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => addZeile()}
              className="text-xs px-3 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
            >
              + Position
            </button>
          </div>
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
              onRefreshTermine={() => {
                if (z.modelId != null) {
                  void refreshTermineFuerZeile(z.uid, z.modelId);
                }
              }}
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
            {saveStatus ? (
              <span className="text-xs text-[color:var(--brand-blue)]">
                {saveStatus}
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
              onClick={speichereVorlage}
              disabled={!kundenEmail.trim() || zeilen.length === 0}
              className="text-xs px-3 py-1 rounded border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/10 disabled:opacity-50"
              title="Speichert die Notiz unter der Kunden-Email -- spaeter beim Rechnungs-Erstellen wieder einlesbar"
            >
              Als Vorlage speichern
            </button>
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

      {/* --- Vorlagen-Browser-Modal --- */}
      <VorlagenBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={ladeVorlage}
      />
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
  onRefreshTermine: () => void;
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
  onRefreshTermine,
}: ZeileProps) {
  const isReihe = zeile.kind === "reihe";
  const isArtikel = zeile.kind === "artikel";
  const isPicked = zeile.modelId != null;
  const collapsed = zeile.collapsed;

  // Zusammenfassung im eingeklappten Header
  const summary = (() => {
    if (!zeile.kind) return "(neu)";
    const name = zeile.salesName.trim() || "(kein Name)";
    if (zeile.kind === "artikel") {
      return zeile.freitext.trim()
        ? `${name} ${zeile.freitext.trim()}`
        : name;
    }
    if (!zeile.terminBekannt
        || zeile.selectedTerminIds.length === 0) {
      return zeile.freitext.trim()
        ? `${name} ${zeile.freitext.trim()}`
        : name;
    }
    const akt = zeile.termine.filter((t) =>
      zeile.selectedTerminIds.includes(t.event_id),
    );
    if (akt.length === 0) return name;
    if (akt.length === 1) {
      return `${name} — ${akt[0].start_date}`
        + (akt[0].end_date && akt[0].end_date !== akt[0].start_date
            ? ` bis ${akt[0].end_date}` : "");
    }
    return `${name} — ${akt.length} Termine `
      + `(${akt[0].start_date} … ${akt[akt.length - 1].end_date
                                    || akt[akt.length - 1].start_date})`;
  })();

  return (
    <div className="border border-[color:var(--border)] rounded bg-[color:var(--background)]">
      <div
        className={`flex items-start justify-between gap-2 px-3 py-2 ${
          collapsed ? "cursor-pointer hover:bg-[color:var(--surface)]" : ""
        }`}
        onClick={collapsed ? () => onUpdate({ collapsed: false }) : undefined}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({ collapsed: !collapsed });
            }}
            className="text-xs w-5 shrink-0 text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            title={collapsed ? "Ausklappen" : "Einklappen"}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              Pos {idx}
              {isReihe ? " · Seminar/Reihe" : isArtikel ? " · Artikel" : ""}
            </div>
            {collapsed ? (
              <div className="text-sm truncate">{summary}</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove(-1); }}
            disabled={first}
            className="text-xs px-1.5 py-0.5 rounded border border-[color:var(--border)] disabled:opacity-30"
            title="Nach oben"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove(1); }}
            disabled={last}
            className="text-xs px-1.5 py-0.5 rounded border border-[color:var(--border)] disabled:opacity-30"
            title="Nach unten"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-xs text-[color:var(--brand-orange)] hover:underline ml-2"
          >
            Entfernen
          </button>
        </div>
      </div>
      {collapsed ? null : (
      <div className="px-3 pb-3 pt-0">

      {/* Kind-Toggle */}
      {!zeile.kind ? (
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => onUpdate({ kind: "artikel" })}
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
            <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="text-[color:var(--brand-blue)]">
                ↳ Zugeordnet zu SimplyOrg-
                {isReihe ? "Reihe" : "Artikel"}:{" "}
                {zeile.catalogTitle} (#{zeile.modelId})
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    modelId: null,
                    catalogTitle: "",
                    termine: [],
                    selectedTerminIds: [],
                    terminBekannt: false,
                  })
                }
                className="text-xs text-[color:var(--brand-orange)] hover:underline"
                title="Auswahl loeschen und neue Reihe / Artikel suchen"
              >
                × andere wählen
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Termin-Auswahl (nur bei Reihe mit Pick) */}
      {isReihe && isPicked ? (
        <div className="mb-2 p-2 border border-[color:var(--border)] rounded bg-[color:var(--surface)]">
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={zeile.terminBekannt}
                onChange={(e) => onUpdate({ terminBekannt: e.target.checked })}
                className="accent-[color:var(--brand-blue)]"
              />
              <span>Termine bekannt</span>
            </label>
            <button
              type="button"
              onClick={onRefreshTermine}
              disabled={zeile.ladeTermine || zeile.modelId == null}
              className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--background)] disabled:opacity-50"
              title="Aktuelle Termine aus SimplyOrg laden"
            >
              ↻ aktualisieren
            </button>
          </div>
          {zeile.ladeTermine ? (
            <div className="text-xs text-[color:var(--muted)] mt-1">
              Lade Termine aus SimplyOrg…
            </div>
          ) : null}
          {!zeile.ladeTermine && zeile.termine.length === 0 ? (
            <div className="text-xs text-[color:var(--brand-orange)] mt-1">
              Keine Termine zur Reihe gefunden.
            </div>
          ) : null}
          {zeile.terminBekannt && zeile.termine.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              <div className="text-xs text-[color:var(--muted)]">
                Welche Termine sollen verbucht werden? (Auswahl
                steuert Notiz-Text UND spätere Rechnungs-Einbuchung.)
              </div>
              {zeile.termine.map((t, idx) => {
                const sel = zeile.selectedTerminIds.includes(t.event_id);
                const label = fmtRangeKompakt(
                  t.start_date,
                  t.end_date || t.start_date,
                );
                return (
                  <label
                    key={t.event_id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[color:var(--brand-blue)]/5 px-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...zeile.selectedTerminIds, t.event_id]
                          : zeile.selectedTerminIds.filter(
                              (id) => id !== t.event_id,
                            );
                        onUpdate({ selectedTerminIds: next });
                      }}
                      className="accent-[color:var(--brand-blue)]"
                    />
                    <span className="text-xs text-[color:var(--muted)] w-14 shrink-0">
                      Modul {idx + 1}
                    </span>
                    <span className="flex-1">{label}</span>
                    {t.name ? (
                      <span className="text-xs text-[color:var(--muted)] truncate">
                        {t.name}
                      </span>
                    ) : null}
                    <span className="font-mono text-[10px] text-[color:var(--muted)] shrink-0">
                      #{t.event_id}
                    </span>
                  </label>
                );
              })}
              {/* Format-Toggle nur wenn mehrere Termine ausgewaehlt */}
              {zeile.selectedTerminIds.length > 1 ? (
                <div className="flex items-center gap-3 text-xs mt-2 pt-2 border-t border-[color:var(--border)]">
                  <span className="text-[color:var(--muted)]">
                    Anzeige in der Notiz:
                  </span>
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
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Praefix-Text */}
      {isPicked && isReihe && zeile.terminBekannt
            && zeile.selectedTerminIds.length > 0 ? (
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
      )}
    </div>
  );
}
