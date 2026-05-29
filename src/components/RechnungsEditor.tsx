"use client";

/**
 * Rechnungs-Editor
 * ----------------
 * Strukturierter Editor für SimplyOrg-Rechnungen.
 *
 *   1. Hauptprodukt wählen (Dropdown aus echten SimplyOrg-Artikeln)
 *   2. Auto-Vorschläge laut Rechnungsmanagement-Handbuch
 *   3. Pro Zeile: Artikel/Seminar wählen, optional Termin
 *   4. Submit → POST /api/bot/rechnung (Bot-Proxy)
 *
 * Loads from /api/bot/* (Next.js Proxy zum Mac-Mini-Bot).
 * Kein Bot-API-Token im Browser.
 */

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/types";
import { botUrl } from "@/lib/bot-client";

interface Article {
  id: number;
  title: string;
  price?: number | null;
  default_tax_percent?: number | null;
}

interface Reihe {
  qualification_id: number;
  name: string;
  start_date: string;
  end_date: string;
  kategorie?: string;
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

interface PersonHit {
  person_id: number;
  address_id?: number | null;
  // Bot liefert je nach Quelle 'label', 'name' und/oder 'person_label'.
  // Alle drei sind optional, wir picken beim Submit den ersten
  // nicht-leeren als slack_name (= Drive-Vertrags-Lookup-Key).
  label?: string;
  name?: string;
  person_label?: string;
  email?: string;
}

type ZeileKind = "seminar" | "reihe" | "artikel";

interface Zeile {
  uid: string;                  // local key
  kind: ZeileKind | "";         // leer = nichts gewählt
  modelId: number | null;       // article_id ODER qualification_id
  modelTyp?: "planned-qualifications" | "planned-event" | "article";
  title: string;
  preis: string;                // input-string (Komma-tolerant)
  taxPercent: string;
  terminEventIds: number[];
  startDate?: string;
  endDate?: string;
  freitextNotiz: string;
  // UI-State
  searchText: string;
  searchResults: (Article | Reihe)[];
  searching: boolean;
  termine: Termin[];
  ladeTermine: boolean;
}

function newUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function leereZeile(): Zeile {
  return {
    uid: newUid(),
    kind: "",
    modelId: null,
    title: "",
    preis: "0",
    taxPercent: "0",
    terminEventIds: [],
    startDate: undefined,
    endDate: undefined,
    freitextNotiz: "",
    searchText: "",
    searchResults: [],
    searching: false,
    termine: [],
    ladeTermine: false,
  };
}

interface Props {
  deal: Deal;
  open: boolean;
  onClose: () => void;
}

export default function RechnungsEditor({ deal, open, onClose }: Props) {
  // Lazy-initial values: werden EINMAL beim Mount berechnet. Parent
  // rendert mit key={deal.id} damit bei einem anderen Deal sauber
  // neu gemountet wird.
  const [empfaenger, setEmpfaenger] = useState<PersonHit | null>(null);
  const [empfaengerSuche, setEmpfaengerSuche] = useState(
    () => `${deal.vorname ?? ""} ${deal.nachname ?? ""}`.trim(),
  );
  const [empfaengerOptions, setEmpfaengerOptions] = useState<PersonHit[]>([]);
  const [empfaengerLaden, setEmpfaengerLaden] = useState(false);

  const [hauptprodukte, setHauptprodukte] = useState<Hauptprodukt[]>([]);
  const [hauptprodukt, setHauptprodukt] = useState<string>("");
  const [vorschlaege, setVorschlaege] = useState<{
    pflicht: Vorschlag[];
    haeufig: Vorschlag[];
    gelegentlich: Vorschlag[];
  } | null>(null);
  const [vorschlaegeLaden, setVorschlaegeLaden] = useState(false);

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [rechnungstitel, setRechnungstitel] = useState("");
  // true = Titel wurde nie manuell editiert -> Auto-Fill aus Pos 1
  // + Nachname darf weiter ueberschreiben. Sobald Mario tippt,
  // bleibt sein Wert stehen.
  const [titelTouched, setTitelTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<unknown>(null);
  // Nach erfolgreicher LIVE-Anlage: Invoice + 2-Stufen-Workflow
  // ('Vorschau pruefen, dann Versenden').
  const [createdInvoice, setCreatedInvoice] = useState<{
    id: number;
    status: "draft" | "sent" | "cancelled";
  } | null>(null);
  const [stornieren, setStornieren] = useState(false);
  const [stornoError, setStornoError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Rohdaten der Rechnung aus SimplyOrg fuer die Tabellen-Vorschau
  // (anstelle des langsamen / oft weissen PDF-iframes).
  const [details, setDetails] = useState<{
    id: number;
    number: string;
    name: string;
    status: string;
    status_text: string;
    invoice_recipient: string;
    currency_symbol: string;
    total_invoice_amount: number;
    remaining_amount: number;
    total_paid_amount: number;
    created_at: string;
    lines: Array<{
      id: number;
      title: string;
      amount: number;
      quantity: number;
      discount: number;
      tax_percent: number;
      tax_name: string;
      subtotal: number;
      start_end_date: string;
      model: string;
      description?: string;
    }>;
  } | null>(null);
  const [detailsLaden, setDetailsLaden] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Notiz-Vorlage fuer diese Deal-Email gefunden? Wird beim Open
  // automatisch geladen und als Pre-Fill verwendet.
  const [vorlageInfo, setVorlageInfo] = useState<{
    id: string;
    created_at: string;
    name: string | null;
    hauptprodukt: string | null;
  } | null>(null);
  const [vorlageBanner, setVorlageBanner] = useState<string>("");

  // --- Initial: Empfänger-Suche mit Deal-Namen ---
  // React 19: setState im Effekt-Body waere ein cascading render --
  // wir trennen Effekt (reine Side-Effects) von State-Reset (rein
  // synchron, ueber initial-render-key gesteuert).
  useEffect(() => {
    if (!open) return;
    const namen = `${deal.vorname ?? ""} ${deal.nachname ?? ""}`.trim();
    if (namen) void searchEmpfaenger(namen);
    void loadHauptprodukte();
    // Notiz-Vorlage suchen: 1) per deal.email (exakt), 2) falls
    // leer/nichts gefunden, per Name (substring auf 'q=...').
    if (deal.email) {
      void ladeNotizVorlageFuerEmail(deal.email);
    } else if (namen) {
      void ladeNotizVorlagePerSuche(namen);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal.id]);

  // Wenn der SimplyOrg-Empfaenger vom Personen-Endpoint eine Email
  // mitbringt UND wir noch keine Vorlage geladen haben, nochmal
  // mit der SimplyOrg-Email lookup -- haeufiger Fall: deal.email
  // ist leer aber SimplyOrg kennt die Kontakt-Email.
  useEffect(() => {
    if (!open) return;
    if (vorlageInfo) return; // schon geladen
    if (!empfaenger?.email) return;
    if (deal.email && deal.email.toLowerCase() === empfaenger.email.toLowerCase()) return;
    void ladeNotizVorlageFuerEmail(empfaenger.email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empfaenger?.email]);

  // Auto-Titel: 'Stammname von Pos 1' + Nachname des Empfaengers.
  // Stammname = Position 1 (= Hauptprodukt, sonst erste Zeile) ohne
  // 'Zert.'-Prefix und ohne Klammer-/Bindestrich-Postfix.
  // Beispiel: 'Zert. NLP Practitioner (praesenz)' -> 'NLP Practitioner'.
  // 'Lebens- und Sozialberatung' -> 'LSB'.
  // Greift nur solange Mario das Feld nicht angefasst hat.
  useEffect(() => {
    if (!open) return;
    if (titelTouched) return;
    const pos1Name =
      hauptprodukt
      || zeilen.find((z) => (z.title || "").trim())?.title
      || "";
    const empfNachname = (() => {
      const lbl = (empfaenger?.label
                   || empfaenger?.name
                   || empfaenger?.person_label
                   || "").trim();
      if (lbl) {
        // 'Mustermann, Max' -> 'Mustermann', 'Max Mustermann' -> 'Mustermann'
        const ohneTitel = lbl.replace(/,\s*(MA|MAS|MSc|BSc|PhD|Dr|Mag|Ing|MBA|LLM|MEd|BEd|BA).*$/i, "");
        return ohneTitel.includes(",")
          ? ohneTitel.split(",")[0].trim()
          : (ohneTitel.split(/\s+/).pop() || "").trim();
      }
      return (deal.nachname || "").trim();
    })();
    if (!pos1Name && !empfNachname) {
      return;
    }
    const stamm = (() => {
      const n = pos1Name.trim();
      if (!n) return "";
      const low = n.toLowerCase();
      if (low.includes("lebens") && low.includes("sozial")) return "LSB";
      // Klammer und alles dahinter weg
      let s = n.split("(")[0];
      // Bindestrich-Suffixe weg ('NLP Practitioner - online' etc.)
      s = s.split(/\s+[-–—]\s+/)[0];
      // 'Zert.'-, 'Staatl.'-, 'Cert.'-Prefixe weg
      s = s.replace(/^\s*(Staatl\.?\s*zert\.?|Zert\.?|Cert\.?)\s*/i, "");
      // Trailing 'Online'/'Präsenz'/'Hybrid' (Modus-Suffix) weg
      s = s.replace(/\s+(online|pr[aä]senz|hybrid)\s*$/i, "");
      return s.trim();
    })();
    const auto = [stamm, empfNachname].filter(Boolean).join(" ").trim();
    if (auto && auto !== rechnungstitel) {
      setRechnungstitel(auto);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hauptprodukt, zeilen, empfaenger, deal.nachname, titelTouched]);

  async function ladeNotizVorlagePerSuche(q: string) {
    try {
      const r = await fetch(
        `/cashflow/api/notiz-vorlagen?q=${encodeURIComponent(q)}&limit=5`,
      );
      if (!r.ok) return;
      const j = await r.json();
      const list = (j.data ?? []) as Array<{
        id: string;
        email: string;
        name: string | null;
        hauptprodukt: string | null;
        created_at: string;
      }>;
      if (list.length === 0) {
        setVorlageBanner(
          `Keine Angebots-Notiz für „${q}" gefunden. Erstelle oben „Angebots-Notiz“ eine, oder fülle hier manuell aus.`,
        );
        return;
      }
      if (list.length === 1) {
        await uebernehmeVorlage(list[0].id);
        return;
      }
      // Mehrere Treffer -> Mario informieren, neueste pre-load
      setVorlageBanner(
        `${list.length} Vorlagen passen zu „${q}". Lade die neueste (${new Date(list[0].created_at).toLocaleDateString("de-AT")}) — falls falsch, oben „Angebots-Notiz" öffnen + manuell wählen.`,
      );
      await uebernehmeVorlage(list[0].id);
    } catch (e) {
      console.error("vorlage-suche", e);
    }
  }

  async function ladeNotizVorlageFuerEmail(email: string) {
    try {
      const r = await fetch(
        `/cashflow/api/notiz-vorlagen?email=${encodeURIComponent(email)}`,
      );
      if (!r.ok) return;
      const j = await r.json();
      const list = (j.data ?? []) as Array<{
        id: string;
        created_at: string;
        name: string | null;
        hauptprodukt: string | null;
      }>;
      if (list.length === 0) {
        setVorlageBanner(
          `Keine Angebots-Notiz für ${email} gespeichert. Lege oben „Angebots-Notiz“ eine an, oder fülle hier manuell aus.`,
        );
        return;
      }
      // Neueste laden + alle Positionen befuellen
      await uebernehmeVorlage(list[0].id);
    } catch (e) {
      console.error("vorlage-lookup", e);
    }
  }

  async function uebernehmeVorlage(id: string) {
    try {
      const r = await fetch(`/cashflow/api/notiz-vorlagen/${id}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setVorlageBanner(`Vorlage konnte nicht geladen werden: ${j.error || r.statusText}`);
        return;
      }
      const v = await r.json();
      setVorlageInfo({
        id: v.id,
        created_at: v.created_at,
        name: v.name,
        hauptprodukt: v.hauptprodukt,
      });
      // Hat diese Vorlage bereits eine angelegte Rechnung? Dann
      // direkt in den Preview-/Versende-Modus springen.
      if (v.rechnung_id) {
        setCreatedInvoice({
          id: Number(v.rechnung_id),
          status: (v.rechnung_status === "sent" ? "sent" : "draft"),
        });
      }
      if (v.rechnungstitel) {
        setRechnungstitel(v.rechnungstitel);
        // Explizit gespeicherter Titel zaehlt als "vom User gewollt"
        // -> Auto-Effekt soll ihn nicht ueberschreiben.
        setTitelTouched(true);
      }
      if (v.hauptprodukt) {
        setHauptprodukt(v.hauptprodukt);
        // Vorschlaege im Hintergrund laden (fuer die '+ XYZ'-
        // Buttons), aber NICHT die geladenen Vorlage-Positionen
        // ueberschreiben -- sonst sieht Mario am Ende nur die 2
        // Pflicht-Defaults statt seiner 6 Vorlage-Zeilen.
        void selectHauptprodukt(v.hauptprodukt, false);
      }
      // Notiz-Zeilen -> Rechnungs-Zeilen mappen.
      // WICHTIG: kein Filter auf modelId -- Mario hat im
      // Notiz-Generator auch Positionen ohne SimplyOrg-Pick angelegt
      // (z.B. aus Hauptprodukt-Vorschlaegen). Diese kommen mit
      // modelId=null, werden trotzdem geladen damit Mario sie im
      // Rechnungs-Editor zuordnen kann (Combobox bleibt offen).
      const restored: Zeile[] = (Array.isArray(v.positionen) ? v.positionen : [])
        .filter((p: { kind?: string }) => p.kind)
        .map((p: {
          kind: string;
          modelTyp?: string;
          modelId?: number | null;
          salesName?: string;
          catalogTitle?: string;
          selectedTerminIds?: number[];
          terminBekannt?: boolean;
          freitext?: string;
          termine?: Termin[];
        }) => {
          // Notiz "reihe" mit modelTyp "planned-event" -> Rechnung "seminar"
          const istEinzel = p.modelTyp === "planned-event";
          const rechKind: ZeileKind = p.kind === "artikel"
            ? "artikel"
            : (istEinzel ? "seminar" : "reihe");
          const termine = p.termine ?? [];
          const firstT = termine[0];
          const lastT = termine[termine.length - 1] ?? firstT;
          // selectedTerminIds-Fallback: wenn Notiz keine Auswahl
          // hatte (z.B. alte Vorlage ohne terminBekannt), nimm alle.
          const eventIds = (p.selectedTerminIds && p.selectedTerminIds.length > 0)
            ? p.selectedTerminIds
            : termine.map((t) => t.event_id);
          return {
            uid: newUid(),
            kind: rechKind,
            modelId: p.modelId ?? null,
            modelTyp: (p.modelTyp as Zeile["modelTyp"]) ?? (
              rechKind === "seminar" ? "planned-event"
              : rechKind === "reihe" ? "planned-qualifications"
              : "article"
            ),
            title: p.salesName || p.catalogTitle || "",
            preis: "0",
            taxPercent: "0",
            terminEventIds: rechKind === "artikel" ? [] : eventIds,
            startDate: firstT?.start_date,
            endDate: lastT?.end_date || lastT?.start_date,
            freitextNotiz: p.freitext ?? "",
            searchText: p.salesName || p.catalogTitle || "",
            searchResults: [],
            searching: false,
            termine,
            ladeTermine: false,
          };
        });
      setZeilen(restored);
      setVorlageBanner(
        `✓ Vorlage vom ${new Date(v.created_at).toLocaleString("de-AT")} geladen. Trage jetzt die Preise ein.`,
      );
    } catch (e) {
      console.error("vorlage", e);
    }
  }

  async function searchEmpfaenger(q: string) {
    if (q.trim().length < 2) return;
    setEmpfaengerLaden(true);
    try {
      const r = await fetch(
        `${botUrl("personen")}?q=${encodeURIComponent(q)}`,
      );
      const j = await r.json();
      const hits: PersonHit[] = j.data ?? [];
      setEmpfaengerOptions(hits);
      if (hits.length === 1) setEmpfaenger(hits[0]);
    } catch (e) {
      console.error("personen", e);
    } finally {
      setEmpfaengerLaden(false);
    }
  }

  async function loadHauptprodukte() {
    try {
      const r = await fetch(botUrl("hauptprodukte"));
      const j = await r.json();
      setHauptprodukte(j.data ?? []);
    } catch (e) {
      console.error("hauptprodukte", e);
    }
  }

  async function selectHauptprodukt(
    name: string, applyDefaults: boolean = true,
  ) {
    setHauptprodukt(name);
    // "kein Hauptprodukt" gewaehlt -> Vorschlaege ausblenden, aber
    // vorhandene Positionen NICHT loeschen (Mario hat sie u.U. schon
    // editiert).
    if (!name) {
      setVorschlaege(null);
      setVorschlaegeLaden(false);
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
      setVorschlaege({
        pflicht: j.pflicht ?? [],
        haeufig: j.haeufig ?? [],
        gelegentlich: j.gelegentlich ?? [],
      });
      // Pflicht-Vorschlaege direkt als Zeilen anlegen --
      // NUR wenn applyDefaults=true (z.B. User waehlt im Dropdown).
      // Beim Laden aus einer Vorlage NICHT, sonst werden die
      // bereits geladenen Vorlage-Positionen ueberschrieben.
      if (applyDefaults) {
        const pflicht: Vorschlag[] = j.pflicht ?? [];
        if (pflicht.length > 0) {
          setZeilen(pflicht.map((v) => vorschlagZuZeile(v)));
        }
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
    z.searchText = v.name;
    z.title = v.name;
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
        title: a.title,
        searchText: a.title,
        searchResults: [],
        preis: a.price != null ? String(a.price) : z.preis,
        taxPercent:
          a.default_tax_percent != null
            ? String(a.default_tax_percent)
            : z.taxPercent,
      });
    } else {
      const r = hit as Reihe;
      updateZeile(uid, {
        modelId: r.qualification_id,
        title: r.name,
        searchText: r.name,
        searchResults: [],
        startDate: r.start_date,
        endDate: r.end_date,
      });
      // Termine direkt laden
      void loadTermine(uid, r.qualification_id);
    }
  }

  async function loadTermine(uid: string, qid: number) {
    updateZeile(uid, { ladeTermine: true });
    try {
      const r = await fetch(`${botUrl("seminare")}/${qid}/termine`);
      const j = await r.json();
      const termine: Termin[] = j.data ?? [];
      updateZeile(uid, {
        termine,
        terminEventIds: termine.map((t) => t.event_id),
        ladeTermine: false,
      });
    } catch (e) {
      console.error("termine", e);
      updateZeile(uid, { ladeTermine: false });
    }
  }

  function toggleTerminCheckbox(uid: string, checked: boolean) {
    const z = zeilen.find((x) => x.uid === uid);
    if (!z) return;
    if (checked) {
      // kind="artikel" -> "reihe"
      updateZeile(uid, { kind: "reihe" });
    } else {
      // kind="reihe" -> "artikel"
      updateZeile(uid, {
        kind: "artikel",
        terminEventIds: [],
        termine: [],
        startDate: undefined,
        endDate: undefined,
      });
    }
  }

  async function submit(dryRun: boolean) {
    setSubmitError(null);
    setSubmitResult(null);
    if (!empfaenger) {
      setSubmitError("Empfänger auswählen.");
      return;
    }
    // Hauptprodukt ist OPTIONAL: wenn nichts gewaehlt, schickt das
    // Dashboard kein hauptartikel-Feld und das Backend uebersprigt
    // die "vertrag-haupt"-Position. Nur die Positionen-Liste zaehlt.
    let hauptArticle: { id: number; title: string } | null = null;
    if (hauptprodukt) {
      hauptArticle = await findArtikelByName(hauptprodukt);
      if (!hauptArticle) {
        setSubmitError(
          `Hauptprodukt-Artikel "${hauptprodukt}" nicht im SimplyOrg-Katalog gefunden.`,
        );
        return;
      }
    }
    // Ohne Hauptprodukt UND ohne Positionen waere die Rechnung leer.
    const positionenZuSenden = zeilen.filter(
      (z) => z.modelId != null && z.kind,
    );
    if (!hauptArticle && positionenZuSenden.length === 0) {
      setSubmitError(
        "Mindestens eine Position oder ein Hauptprodukt nötig.",
      );
      return;
    }
    const payload: Record<string, unknown> = {
      dry_run: dryRun,
      empfaenger: {
        person_id: empfaenger.person_id,
        address_id: empfaenger.address_id ?? undefined,
        label: (
          empfaenger.label
          || empfaenger.name
          || empfaenger.person_label
          || ""
        ),
        email: empfaenger.email,
      },
      rechnungstitel: rechnungstitel || undefined,
      // verwende_vertrag: Backend holt den Vertrag aus Drive per
      // Empfaenger-Label und uebernimmt die Preise aus der
      // Vertrags-Positionsliste -- Mario will keine Preise mehr
      // im UI eintippen.
      verwende_vertrag: true,
      slack_name: (
        empfaenger.label
        || empfaenger.name
        || empfaenger.person_label
        || `${deal.vorname ?? ""} ${deal.nachname ?? ""}`.trim()
      ),
      // Nur Positionen mit gesetztem SimplyOrg-Match werden gesendet.
      // Positionen ohne modelId (= nur Sales-Name aus der Notiz-
      // Vorlage uebernommen, noch kein Pick) werden uebersprungen --
      // Mario muss sie im Modal manuell zuordnen.
      positionen: positionenZuSenden.map((z) => ({
        kind: z.kind,
        id: z.modelId,
        model_typ: z.modelTyp,
        title: z.title,
        // preis/tax bleiben null -> Backend ergaenzt aus Vertrag
        // (per Name-Match auf die Zusatz-Positionen)
        termine_event_ids:
          (z.kind === "reihe" || z.kind === "seminar")
            ? z.terminEventIds
            : undefined,
        start_date: z.startDate,
        end_date: z.endDate,
        freitext_notiz: z.freitextNotiz || undefined,
      })),
    };
    if (hauptArticle) {
      payload.hauptartikel = {
        article_id: hauptArticle.id,
        title: hauptArticle.title,
        // preis bleibt null -> Backend ergaenzt aus Vertrag
        tax_percent: 0,
      };
    }
    setSubmitting(true);
    try {
      const r = await fetch(botUrl("rechnung"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        setSubmitError(j.error || JSON.stringify(j));
        setSubmitResult(j);
      } else {
        setSubmitResult(j);
        // Live-Anlage erfolgreich + invoice_id da -> Status der
        // Vorlage auf 'draft' setzen und Preview anzeigen, damit Mario
        // visuell pruefen kann bevor er versendet.
        const invoiceId = (j as {
          result?: { invoice_id?: number | null };
        })?.result?.invoice_id;
        if (!dryRun && invoiceId && vorlageInfo?.id) {
          try {
            await fetch(
              `/cashflow/api/notiz-vorlagen/${vorlageInfo.id}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  rechnung_id: invoiceId,
                  rechnung_status: "draft",
                  rechnung_created_at: new Date().toISOString(),
                }),
              },
            );
          } catch (e) {
            console.error("PATCH rechnung_status", e);
          }
          setCreatedInvoice({ id: invoiceId, status: "draft" });
        }
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Details aus SimplyOrg laden wenn createdInvoice gesetzt ist.
  // Wir nutzen den Empfaenger-Nachnamen als Suchhint (greift fuer
  // search_text die liste schnell ein).
  useEffect(() => {
    if (!createdInvoice) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setDetailsLaden(true);
    setDetailsError(null);
    const nachname = (deal.nachname || "").trim();
    const url = `/cashflow/api/bot/rechnung/${createdInvoice.id}/details${
      nachname ? `?hint=${encodeURIComponent(nachname)}` : ""
    }`;
    void (async () => {
      try {
        const r = await fetch(url);
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setDetailsError(j.error || `HTTP ${r.status}`);
        } else {
          setDetails(j);
        }
      } catch (e) {
        if (!cancelled)
          setDetailsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setDetailsLaden(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createdInvoice, deal.nachname]);

  // Storno-Action: versendete Rechnung als Gutschrift markieren
  // (toCreditNote in SimplyOrg). Damit kann Mario fuer den Deal
  // wieder eine neue Rechnung anlegen.
  async function storniereRechnung() {
    if (!createdInvoice || !vorlageInfo?.id) return;
    if (createdInvoice.status !== "sent") return;
    if (!window.confirm(
      `Rechnung #${createdInvoice.id} stornieren? `
      + "SimplyOrg legt eine Gutschrift über denselben Betrag an. "
      + "Die Original-Rechnung bleibt im System."
    )) return;
    setStornieren(true);
    setStornoError(null);
    try {
      const r = await fetch(
        botUrl(`rechnung/${createdInvoice.id}/storno`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const j = await r.json();
      if (!r.ok || j.ok === false) {
        setStornoError(
          j.error || `Stornierung fehlgeschlagen (HTTP ${r.status})`,
        );
        return;
      }
      try {
        await fetch(
          `/cashflow/api/notiz-vorlagen/${vorlageInfo.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rechnung_status: "cancelled" }),
          },
        );
      } catch (e) {
        console.error("PATCH cancelled-status", e);
      }
      setCreatedInvoice({ ...createdInvoice, status: "cancelled" });
    } catch (e) {
      setStornoError(e instanceof Error ? e.message : String(e));
    } finally {
      setStornieren(false);
    }
  }

  // Lösch-Action: Draft in SimplyOrg loeschen und Verknuepfung
  // in der Notiz-Vorlage entfernen, damit Mario eine neue Rechnung
  // anlegen kann.
  async function loescheRechnung() {
    if (!createdInvoice || !vorlageInfo?.id) return;
    if (createdInvoice.status !== "draft") return;
    if (!window.confirm(
      `Rechnung #${createdInvoice.id} in SimplyOrg löschen? `
      + "Sie kann danach nicht wiederhergestellt werden."
    )) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await fetch(
        botUrl(`rechnung/${createdInvoice.id}/delete`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const j = await r.json();
      if (!r.ok || j.ok === false) {
        setDeleteError(
          j.error || `Löschen fehlgeschlagen (HTTP ${r.status})`,
        );
        return;
      }
      // Vorlage-Verknuepfung entfernen
      try {
        await fetch(
          `/cashflow/api/notiz-vorlagen/${vorlageInfo.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rechnung_id: null,
              rechnung_status: null,
              rechnung_created_at: null,
            }),
          },
        );
      } catch (e) {
        console.error("PATCH unlink", e);
      }
      setCreatedInvoice(null);
      setSubmitResult(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  // Versende-Action: triggert den Send-Workflow im Bot
  // (Email + status -> 'sent') und aktualisiert die Vorlage.
  async function versendeRechnung() {
    if (!createdInvoice || !vorlageInfo?.id) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch(
        botUrl(`rechnung/${createdInvoice.id}/send`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const j = await r.json();
      if (!r.ok || j.ok === false) {
        setSendError(
          j.error || j.warn || `Versand fehlgeschlagen (HTTP ${r.status})`,
        );
        return;
      }
      // Vorlage updaten
      try {
        await fetch(
          `/cashflow/api/notiz-vorlagen/${vorlageInfo.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rechnung_status: "sent" }),
          },
        );
      } catch (e) {
        console.error("PATCH sent-status", e);
      }
      setCreatedInvoice({ ...createdInvoice, status: "sent" });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function findArtikelByName(name: string): Promise<Article | null> {
    try {
      const r = await fetch(botUrl("articles"));
      const j = await r.json();
      const arts: Article[] = j.data ?? [];
      const lc = name.toLowerCase().trim();
      // Exakter Match bevorzugt, sonst startsWith
      return (
        arts.find((a) => a.title.toLowerCase() === lc) ??
        arts.find((a) => a.title.toLowerCase().startsWith(lc)) ??
        null
      );
    } catch {
      return null;
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--surface)] text-[color:var(--foreground)] rounded-lg shadow-xl max-w-4xl w-full p-6 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">
              Rechnung erstellen
            </h2>
            <p className="text-sm text-[color:var(--muted)]">
              Für {deal.vorname} {deal.nachname}
              {deal.email ? ` (${deal.email})` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-xl leading-none"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        {/* --- Vorlage-Banner --- */}
        {vorlageBanner ? (
          <div
            className={`mb-4 p-2 rounded text-sm flex items-start justify-between gap-2 ${
              vorlageBanner.startsWith("✓")
                ? "bg-green-50 text-green-800"
                : "bg-[color:var(--brand-yellow)]/30 text-[color:var(--foreground)]"
            }`}
          >
            <div>
              {vorlageBanner}
              {vorlageInfo ? (
                <span className="text-xs block opacity-70 mt-0.5">
                  Quelle: Angebots-Notiz · Hauptprodukt „
                  {vorlageInfo.hauptprodukt || "—"}“
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setVorlageBanner("")}
              className="text-xs opacity-60 hover:opacity-100 shrink-0"
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
        ) : null}

        {/* --- Empfänger --- */}
        <section className="mb-5">
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
            SimplyOrg-Empfänger
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={empfaengerSuche}
              onChange={(e) => setEmpfaengerSuche(e.target.value)}
              onBlur={() => searchEmpfaenger(empfaengerSuche)}
              placeholder="Name in SimplyOrg suchen…"
              className="flex-1 border border-[color:var(--border)] rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => searchEmpfaenger(empfaengerSuche)}
              disabled={empfaengerLaden}
              className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
            >
              {empfaengerLaden ? "…" : "Suchen"}
            </button>
          </div>
          {empfaengerOptions.length > 1 && !empfaenger ? (
            <div className="mt-2 border border-[color:var(--border)] rounded">
              {empfaengerOptions.map((p) => (
                <button
                  key={p.person_id}
                  type="button"
                  onClick={() => setEmpfaenger(p)}
                  className="block w-full text-left text-sm px-2 py-1 hover:bg-[color:var(--brand-blue)]/10 border-b border-[color:var(--border)] last:border-b-0"
                >
                  #{p.person_id} {p.label}
                  {p.email ? (
                    <span className="text-xs text-[color:var(--muted)]">
                      {" "}
                      ({p.email})
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          {empfaenger ? (
            <div className="mt-1 text-xs text-[color:var(--brand-blue)]">
              ✓ #{empfaenger.person_id}{" "}
              {empfaenger.label || empfaenger.name || empfaenger.person_label || ""}
              {empfaenger.email ? ` (${empfaenger.email})` : ""}
            </div>
          ) : null}
        </section>

        {/* --- Rechnungstitel (Auto-Fill: Pos-1-Stamm + Nachname) --- */}
        <section className="mb-5">
          <div className="flex items-baseline justify-between">
            <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
              Rechnungstitel
            </label>
            {titelTouched ? (
              <button
                type="button"
                onClick={() => {
                  setTitelTouched(false);
                  setRechnungstitel("");
                }}
                className="text-xs text-[color:var(--brand-blue)] hover:underline"
                title="Wieder automatisch aus Pos 1 + Nachname bilden"
              >
                ↻ Auto
              </button>
            ) : null}
          </div>
          <input
            type="text"
            value={rechnungstitel}
            onChange={(e) => {
              setRechnungstitel(e.target.value);
              setTitelTouched(true);
            }}
            placeholder="wird automatisch aus Pos 1 + Nachname gebildet"
            className="w-full border border-[color:var(--border)] rounded px-2 py-1 text-sm"
          />
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Beispiel: „NLP Practitioner Müller". Du kannst überschreiben — „↻ Auto" stellt das Automatik-Verhalten wieder her.
          </p>
        </section>

        {/* --- Hauptprodukt --- */}
        <section className="mb-5">
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
            Hauptprodukt (Pos 1) — optional
          </label>
          <div className="flex gap-2">
            <select
              value={hauptprodukt}
              onChange={(e) => selectHauptprodukt(e.target.value)}
              className="flex-1 border border-[color:var(--border)] rounded px-2 py-1 text-sm"
            >
              <option value="">— kein Hauptprodukt (nur Einzelpositionen) —</option>
              {hauptprodukte.map((h) => (
                <option key={h.name} value={h.name}>
                  {h.name}
                  {h.anzahl_rechnungen
                    ? ` (${h.anzahl_rechnungen}× verkauft)`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Preise werden automatisch aus dem signierten Vertrag in
            Drive geholt — du musst hier nichts eintragen. Bei
            Einzelprodukten (kein Vertrag mit Haupt + Zusatz) einfach
            „kein Hauptprodukt" lassen und nur Positionen anlegen.
          </p>
          {vorschlaegeLaden ? (
            <p className="text-xs text-[color:var(--muted)] mt-1">
              Lade Vorschläge…
            </p>
          ) : null}
          {vorschlaege && (vorschlaege.haeufig.length > 0 || vorschlaege.gelegentlich.length > 0) ? (
            <div className="mt-2 text-xs text-[color:var(--muted)]">
              <span>Weitere häufige Positionen: </span>
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
        <section className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)]">
              Weitere Positionen ({zeilen.length})
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
              Noch keine Positionen — wähle ein Hauptprodukt oder klicke „+ Position“.
            </p>
          ) : null}
          <div className="space-y-3">
            {zeilen.map((z, idx) => (
              <ZeileEditor
                key={z.uid}
                idx={idx + 2}
                zeile={z}
                onUpdate={(patch) => updateZeile(z.uid, patch)}
                onRemove={() => removeZeile(z.uid)}
                onSearch={(q, k) => searchZeile(z.uid, q, k)}
                onPickHit={(hit) => pickSearchHit(z.uid, hit)}
                onToggleTermin={(c) => toggleTerminCheckbox(z.uid, c)}
              />
            ))}
          </div>
        </section>

        {/* --- Submit --- */}
        <section className="border-t border-[color:var(--border)] pt-4">
          {submitError ? (
            <div className="mb-3 p-2 rounded bg-red-50 text-red-800 text-sm">
              ❌ {submitError}
            </div>
          ) : null}
          {submitResult && !createdInvoice ? (
            <details className="mb-3 p-2 rounded bg-[color:var(--brand-blue)]/10 text-sm">
              <summary className="cursor-pointer">
                ✓ Bot-Antwort (JSON)
              </summary>
              <pre className="text-xs overflow-x-auto mt-2">
                {JSON.stringify(submitResult, null, 2)}
              </pre>
            </details>
          ) : null}
          {/* Nach Live-Anlage: 2-Stufen-Workflow Preview + Versenden */}
          {createdInvoice ? (
            <div className="mb-3 space-y-3">
              <div
                className={`p-3 rounded text-sm flex items-center justify-between gap-2 ${
                  createdInvoice.status === "sent"
                    ? "bg-green-50 text-green-800"
                    : createdInvoice.status === "cancelled"
                    ? "bg-red-50 text-red-800"
                    : "bg-[color:var(--brand-orange)]/10 text-[color:var(--brand-orange)]"
                }`}
              >
                <div>
                  {createdInvoice.status === "sent" ? (
                    <span>
                      ✓ Rechnung #{createdInvoice.id} angelegt und an{" "}
                      <strong>
                        {empfaenger?.email || deal.email}
                      </strong>{" "}
                      versendet.
                    </span>
                  ) : createdInvoice.status === "cancelled" ? (
                    <span>
                      ⛔ Rechnung #{createdInvoice.id} storniert — in
                      SimplyOrg wurde eine Gutschrift angelegt. Du kannst
                      jetzt eine neue Rechnung für diesen Deal erstellen.
                    </span>
                  ) : (
                    <span>
                      ● Rechnung #{createdInvoice.id} als{" "}
                      <strong>Draft</strong> in SimplyOrg angelegt. Bitte
                      prüfen — Versand startet erst nach Klick.
                    </span>
                  )}
                </div>
                <a
                  href={`https://myaazb-admin.simplyorg-seminare.de/de/crud/order-invoice/edit/${createdInvoice.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline opacity-80 hover:opacity-100 shrink-0"
                  title="In SimplyOrg öffnen"
                >
                  in SimplyOrg ↗
                </a>
              </div>
              {/* Vertrag-Zahlungsmodell-Badge (aus plan.vertrag_meta) */}
              {(() => {
                const meta = (submitResult as {
                  plan?: {
                    vertrag_meta?: {
                      zahlungsmodell?: string;
                      raten_info?: string;
                      gesamtbetrag?: number | null;
                    };
                  };
                })?.plan?.vertrag_meta;
                if (!meta?.zahlungsmodell) return null;
                const isRaten = meta.zahlungsmodell === "raten";
                return (
                  <div
                    className={`p-2 rounded text-sm border ${
                      isRaten
                        ? "bg-amber-50 border-amber-300 text-amber-900"
                        : "bg-blue-50 border-blue-300 text-blue-900"
                    }`}
                  >
                    <div className="font-semibold">
                      {isRaten ? "💳 Ratenzahlung" : "💰 Einmalzahlung"}
                      {meta.gesamtbetrag
                        ? ` · ${meta.gesamtbetrag.toLocaleString("de-AT", { style: "currency", currency: "EUR" })}`
                        : null}
                    </div>
                    {isRaten && meta.raten_info ? (
                      <div className="text-xs mt-1 opacity-90">
                        {meta.raten_info}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
              {/* Original-Daten aus SimplyOrg als Tabelle (statt
                  langsamen, oft weissen PDF-iframe). */}
              <div className="border border-[color:var(--border)] rounded bg-white p-4 max-h-[60vh] overflow-y-auto">
                {detailsLaden ? (
                  <div className="text-sm text-[color:var(--muted)] text-center py-8">
                    Lade Rechnungs-Details aus SimplyOrg…
                  </div>
                ) : detailsError ? (
                  <div className="text-sm text-red-700 bg-red-50 p-2 rounded">
                    ❌ {detailsError}
                  </div>
                ) : details ? (
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3 pb-3 border-b border-[color:var(--border)]">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                          Rechnung Nr. {details.number || `#${details.id}`}
                        </div>
                        <div className="text-base font-semibold mt-1">
                          {details.name || "(kein Titel)"}
                        </div>
                        <div className="text-sm text-[color:var(--muted)] mt-1">
                          Empfänger: <strong>{details.invoice_recipient}</strong>
                        </div>
                        <div className="text-xs text-[color:var(--muted)] mt-0.5">
                          Erstellt: {details.created_at}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                          Status
                        </div>
                        <div
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide mt-1 ${
                            details.status === "sent"
                              ? "bg-green-600 text-white"
                              : "bg-[color:var(--brand-orange)] text-white"
                          }`}
                        >
                          {details.status_text || details.status}
                        </div>
                      </div>
                    </div>
                    {/* Positionen */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wider text-[color:var(--muted)] border-b border-[color:var(--border)]">
                          <th className="text-left py-2 w-8">Pos</th>
                          <th className="text-left py-2">Beschreibung</th>
                          <th className="text-right py-2 w-16">Anzahl</th>
                          <th className="text-right py-2 w-24">Einzelpreis</th>
                          <th className="text-right py-2 w-16">MwSt</th>
                          <th className="text-right py-2 w-28">Summe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.lines.map((l, i) => (
                          <tr
                            key={l.id}
                            className="border-b border-[color:var(--border)]/30"
                          >
                            <td className="py-2">{i + 1}</td>
                            <td className="py-2">
                              <div>{l.title}</div>
                              {l.start_end_date ? (
                                <div className="text-xs text-[color:var(--muted)]">
                                  Termin: {l.start_end_date}
                                </div>
                              ) : null}
                              {l.description ? (
                                <div className="text-xs text-[color:var(--muted)]">
                                  {l.description}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {l.quantity}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {l.amount.toLocaleString("de-AT", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </td>
                            <td className="py-2 text-right">
                              {l.tax_percent}%
                            </td>
                            <td className="py-2 text-right tabular-nums font-medium">
                              {l.subtotal.toLocaleString("de-AT", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[color:var(--border)]">
                          <td colSpan={5} className="py-2 text-right font-semibold">
                            Gesamtbetrag:
                          </td>
                          <td className="py-2 text-right tabular-nums font-bold text-base">
                            {details.total_invoice_amount.toLocaleString(
                              "de-AT",
                              { style: "currency", currency: "EUR" },
                            )}
                          </td>
                        </tr>
                        {details.total_paid_amount > 0 ? (
                          <tr>
                            <td colSpan={5} className="py-1 text-right text-xs text-[color:var(--muted)]">
                              bereits bezahlt:
                            </td>
                            <td className="py-1 text-right text-xs tabular-nums text-[color:var(--muted)]">
                              {details.total_paid_amount.toLocaleString(
                                "de-AT",
                                { style: "currency", currency: "EUR" },
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-[color:var(--muted)] text-center py-8">
                    Keine Daten geladen.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-[color:var(--muted)]">
                <a
                  href={`/cashflow/api/bot/rechnung/${createdInvoice.id}/pdf?download=1`}
                  download={`Rechnung-${createdInvoice.id}.pdf`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                  title="Original-PDF aus SimplyOrg herunterladen"
                >
                  ⬇ Rechnung-{createdInvoice.id}.pdf herunterladen
                </a>
                <span className="opacity-70">
                  Daten direkt aus SimplyOrg — niemand muss sich einloggen.
                </span>
              </div>
              {sendError ? (
                <div className="p-2 rounded bg-red-50 text-red-800 text-sm">
                  ❌ {sendError}
                </div>
              ) : null}
              {deleteError ? (
                <div className="p-2 rounded bg-red-50 text-red-800 text-sm">
                  ❌ {deleteError}
                </div>
              ) : null}
              {stornoError ? (
                <div className="p-2 rounded bg-red-50 text-red-800 text-sm">
                  ❌ {stornoError}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            {createdInvoice ? (
              <>
                {createdInvoice.status === "draft" ? (
                  <button
                    type="button"
                    onClick={loescheRechnung}
                    disabled={deleting || sending}
                    className="text-sm px-3 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 mr-auto"
                    title="Diesen Draft in SimplyOrg löschen, damit eine neue Rechnung angelegt werden kann"
                  >
                    {deleting ? "Lösche…" : "🗑 Draft verwerfen"}
                  </button>
                ) : null}
                {createdInvoice.status === "sent" ? (
                  <button
                    type="button"
                    onClick={storniereRechnung}
                    disabled={stornieren}
                    className="text-sm px-3 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 mr-auto"
                    title="Versendete Rechnung stornieren (SimplyOrg legt eine Gutschrift an)"
                  >
                    {stornieren ? "Storniere…" : "⛔ Stornieren (Gutschrift)"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm px-3 py-1 rounded border border-[color:var(--border)]"
                >
                  {createdInvoice.status === "draft" ? "Später" : "Schließen"}
                </button>
                {createdInvoice.status === "draft" ? (
                  <button
                    type="button"
                    onClick={versendeRechnung}
                    disabled={sending || deleting}
                    className="text-sm px-3 py-1 rounded bg-green-600 text-white disabled:opacity-50"
                    title="Versendet die Rechnung per Email an den Kunden und setzt den Status auf 'sent'"
                  >
                    {sending ? "Versende…" : "✉ Per Email versenden"}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm px-3 py-1 rounded border border-[color:var(--border)]"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={submitting}
                  className="text-sm px-3 py-1 rounded border border-[color:var(--border)] disabled:opacity-50"
                  title="Plan zurück, nichts in SimplyOrg anlegen"
                >
                  {submitting ? "…" : "Plan prüfen (Dry-Run)"}
                </button>
                <button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={submitting}
                  className="text-sm px-3 py-1 rounded bg-[color:var(--brand-blue)] text-white disabled:opacity-50"
                >
                  {submitting ? "Erstelle…" : "Rechnung anlegen (Draft)"}
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// --- Number helpers ------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseDecimal(s: string): number {
  if (!s) return 0;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// --- Sub-Komponente: eine Zeile -------------------------------------
interface ZeileProps {
  idx: number;
  zeile: Zeile;
  onUpdate: (patch: Partial<Zeile>) => void;
  onRemove: () => void;
  onSearch: (q: string, kind: ZeileKind) => void;
  onPickHit: (hit: Article | Reihe) => void;
  onToggleTermin: (checked: boolean) => void;
}

function ZeileEditor({
  idx,
  zeile,
  onUpdate,
  onRemove,
  onSearch,
  onPickHit,
  onToggleTermin,
}: ZeileProps) {
  // Sowohl Reihen (planned-qualifications) als auch Einzelseminare
  // (planned-event/'seminar') werden gleich gerendert -- beide
  // brauchen Termin-Anzeige und Auto-Einbuchungs-Checkbox.
  const isReihe = zeile.kind === "reihe" || zeile.kind === "seminar";
  const isArtikel = zeile.kind === "artikel";
  const isPicked = zeile.modelId != null;
  return (
    <div className={`border rounded p-3 bg-[color:var(--background)] ${
      isPicked
        ? "border-[color:var(--border)]"
        : "border-[color:var(--brand-orange)]/60 bg-[color:var(--brand-yellow)]/10"
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
          Pos {idx}
          {isReihe ? " · Seminar/Reihe" : isArtikel ? " · Artikel" : ""}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-[color:var(--brand-orange)] hover:underline"
        >
          Entfernen
        </button>
      </div>

      {/* Kind-Toggle (falls noch nichts gewählt) */}
      {!zeile.kind ? (
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => onUpdate({ kind: "artikel" })}
            className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
          >
            Artikel
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ kind: "reihe" })}
            className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
          >
            Seminar / Reihe
          </button>
        </div>
      ) : null}

      {/* Such-Combobox */}
      {zeile.kind ? (
        <div className="mb-2 relative">
          <input
            type="text"
            value={zeile.searchText}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate({ searchText: v, modelId: null });
              onSearch(v, zeile.kind as ZeileKind);
            }}
            placeholder={
              zeile.kind === "artikel"
                ? "Artikel suchen…"
                : "Seminar/Reihe suchen…"
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
                    ? `#${(h as Article).id} · ${(h as Article).price ?? "?"} €`
                    : `#${(h as Reihe).qualification_id} · ${(h as Reihe).start_date}–${(h as Reihe).end_date}`;
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => onPickHit(h)}
                    className="block w-full text-left text-sm px-2 py-1 hover:bg-[color:var(--brand-blue)]/10 border-b border-[color:var(--border)] last:border-b-0"
                  >
                    {label}
                    <span className="text-xs text-[color:var(--muted)]">
                      {" — "}{sub}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Termin-Checkbox (nur wenn etwas gewählt + Seminar/Reihe-Modus) */}
      {isPicked && (isReihe || isArtikel) ? (
        <div className="mb-2 flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={isReihe}
              onChange={(e) => onToggleTermin(e.target.checked)}
              className="accent-[color:var(--brand-blue)]"
            />
            <span>Termin vereinbart (Auto-Einbuchung)</span>
          </label>
          {isReihe && zeile.ladeTermine ? (
            <span className="text-xs text-[color:var(--muted)]">
              Lade Termine…
            </span>
          ) : null}
          {isReihe && zeile.termine.length > 0 ? (
            <span className="text-xs text-[color:var(--muted)]">
              {zeile.termine.length} Termine,{" "}
              {zeile.startDate} – {zeile.endDate}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Preise kommen aus dem Vertrag -- kein UI-Input hier. */}

      {/* Freitext-Notiz (rein dokumentarisch, nicht an SimplyOrg gesendet) */}
      <div className="mt-2">
        <label className="block text-xs text-[color:var(--muted)]">
          Notiz (intern, nicht auf der Rechnung)
        </label>
        <input
          type="text"
          value={zeile.freitextNotiz}
          onChange={(e) => onUpdate({ freitextNotiz: e.target.value })}
          placeholder="z.B. tbd ob Präsenz oder online"
          className="w-full border border-[color:var(--border)] rounded px-2 py-1 text-sm"
        />
      </div>
    </div>
  );
}
