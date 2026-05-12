/**
 * Restauriert betrag (Provisions-Basis) aus dem XLSX-Backup.
 *
 * Aufruf:
 *   # Dry-Run (zeigt Plan, schreibt nichts):
 *   npx dotenv-cli -e .env.local -- tsx scripts/restore-betrag.ts
 *
 *   # Echt durchführen:
 *   npx dotenv-cli -e .env.local -- tsx scripts/restore-betrag.ts --apply
 *
 * Verhalten:
 *   - Matcht XLSX-Zeile → DB-Deal per Email (case-insensitive)
 *   - Bei mehreren Deals pro Email: zusätzlicher Match per Start-Monat (YYYY-MM)
 *   - Schreibt ausschließlich `betrag` — `betrag_original` (HubSpot-Wahrheit)
 *     bleibt unverändert
 *   - Skipt, wenn DB-Deal nicht gefunden, ambig ist, oder betrag bereits stimmt
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

interface XlsxRow {
  src_row: number;
  vorname: string | null;
  nachname: string | null;
  mitarbeiter_id: string | null;
  email: string;
  betrag: number;
  anzahl_raten: number | null;
  intervall: string | null;
  start_datum: string | null; // YYYY-MM-DD
}

interface DbDeal {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  mitarbeiter_id: string;
  mitarbeiter_name: string;
  betrag: number;
  betrag_original: number | null;
  start_datum: string | null;
  hubspot_deal_id: string | null;
  pending_delete: boolean;
}

const APPLY = process.argv.includes("--apply");

function need(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`FEHLER: ENV ${key} fehlt. dotenv-cli mit .env.local laden.`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const url = need("NEXT_PUBLIC_SUPABASE_URL");
  const key = need("SUPABASE_SECRET_KEY");
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });

  const xlsxRows = JSON.parse(
    readFileSync(
      new URL("./restore_betrag_data.json", import.meta.url),
      "utf-8",
    ),
  ) as XlsxRow[];

  // 1) Alle Deals laden
  const { data: dealsRaw, error } = await supabase
    .from("deals")
    .select(
      "id, vorname, nachname, email, mitarbeiter_id, mitarbeiter_name, betrag, betrag_original, start_datum, hubspot_deal_id, pending_delete",
    );
  if (error) throw error;
  const deals = (dealsRaw ?? []) as DbDeal[];

  // 2) Index nach Email
  const byEmail = new Map<string, DbDeal[]>();
  for (const d of deals) {
    if (!d.email) continue;
    const k = d.email.toLowerCase();
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k)!.push(d);
  }
  // Fallback-Index nach Nachname (case-insensitive, substring-match-fähig)
  const byNachname = new Map<string, DbDeal[]>();
  for (const d of deals) {
    if (!d.nachname) continue;
    const k = d.nachname.trim().toLowerCase();
    if (!byNachname.has(k)) byNachname.set(k, []);
    byNachname.get(k)!.push(d);
  }
  function findByName(src: XlsxRow): DbDeal[] {
    if (!src.nachname) return [];
    // XLSX-Nachname kann Suffixe enthalten ("Duchek, MA"), DB-Nachname
    // Zusatznamen ("Mira Magdalena Hasenöhrl") — wir vergleichen den ersten
    // alphabetischen Block in beide Richtungen.
    const norm = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .replace(/,.*$/, "")
        .trim();
    const srcKey = norm(src.nachname);
    if (!srcKey) return [];
    const direct = byNachname.get(srcKey) ?? [];
    if (direct.length > 0) return direct;
    return deals.filter((d) => {
      if (!d.nachname) return false;
      const dKey = norm(d.nachname);
      return (
        dKey === srcKey ||
        dKey.includes(srcKey) ||
        srcKey.includes(dKey)
      );
    });
  }

  type PlanEntry = {
    src: XlsxRow;
    deal: DbDeal;
    oldBetrag: number;
    newBetrag: number;
    diff: number;
    matchedBy: "email" | "name";
  };

  const updates: PlanEntry[] = [];
  const alreadyOk: PlanEntry[] = [];
  const noMatch: XlsxRow[] = [];
  const ambiguous: { src: XlsxRow; candidates: DbDeal[] }[] = [];

  for (const src of xlsxRows) {
    // Platzhalter-Zeilen im XLSX überspringen (betrag=0 ohne Start/Intervall —
    // typisch z.B. percyjackson5590, wo zwei XLSX-Zeilen pro Mail existieren).
    if (
      src.betrag === 0 &&
      !src.start_datum &&
      !src.intervall &&
      !src.anzahl_raten
    ) {
      continue;
    }
    let candidates = (byEmail.get(src.email) ?? []).filter(
      (d) => !d.pending_delete,
    );
    let matchedBy: "email" | "name" = "email";
    if (candidates.length === 0) {
      // Fallback: Match per Nachname (zusätzlich gefiltert auf Vorname-
      // Substring), falls die DB-Zeile kein email-Feld hat.
      const byName = findByName(src).filter((d) => !d.pending_delete);
      const filtered = byName.filter((d) =>
        src.vorname && d.vorname
          ? d.vorname.toLowerCase().includes(src.vorname.toLowerCase().split(" ")[0])
          : true,
      );
      if (filtered.length > 0) {
        candidates = filtered;
        matchedBy = "name";
      }
    }
    if (candidates.length === 0) {
      noMatch.push(src);
      continue;
    }
    let deal: DbDeal | null = null;
    if (candidates.length === 1) {
      deal = candidates[0];
    } else {
      // Mehrere Deals pro Email → Match nach Start-Monat
      const srcMonth = src.start_datum?.slice(0, 7) ?? null;
      const byMonth = candidates.filter(
        (c) =>
          c.start_datum && srcMonth && c.start_datum.slice(0, 7) === srcMonth,
      );
      if (byMonth.length === 1) deal = byMonth[0];
      else {
        ambiguous.push({ src, candidates });
        continue;
      }
    }
    const entry: PlanEntry = {
      src,
      deal,
      oldBetrag: Number(deal.betrag),
      newBetrag: src.betrag,
      diff: src.betrag - Number(deal.betrag),
      matchedBy,
    };
    if (Math.abs(entry.diff) < 0.005) alreadyOk.push(entry);
    else updates.push(entry);
  }

  // 3) Report
  console.log("");
  console.log(`XLSX-Rows: ${xlsxRows.length}`);
  console.log(`  → bereits korrekt:           ${alreadyOk.length}`);
  console.log(`  → würden aktualisiert:       ${updates.length}`);
  console.log(`  → kein DB-Deal gefunden:     ${noMatch.length}`);
  console.log(`  → ambig (Monat hilft nicht): ${ambiguous.length}`);
  console.log("");

  if (updates.length > 0) {
    console.log("Updates (zeige bis zu 30):");
    for (const u of updates.slice(0, 30)) {
      console.log(
        `  [${u.matchedBy}] ${u.src.email.padEnd(40)}  ${String(u.oldBetrag).padStart(10)} → ${String(u.newBetrag).padStart(10)}  (Δ ${u.diff.toFixed(2)})  ${u.deal.vorname} ${u.deal.nachname}`,
      );
    }
    if (updates.length > 30) {
      console.log(`  … und ${updates.length - 30} weitere`);
    }
    console.log("");
  }
  if (noMatch.length > 0) {
    console.log("Kein DB-Deal gefunden für:");
    for (const n of noMatch) {
      console.log(
        `  ${n.email.padEnd(40)}  ${n.vorname} ${n.nachname}  betrag=${n.betrag}`,
      );
    }
    console.log("");
  }
  if (ambiguous.length > 0) {
    console.log("Ambige Fälle (manuell prüfen):");
    for (const a of ambiguous) {
      console.log(
        `  ${a.src.email}  XLSX-betrag=${a.src.betrag} start=${a.src.start_datum} — Kandidaten:`,
      );
      for (const c of a.candidates) {
        console.log(
          `    deal_id=${c.id} betrag=${c.betrag} betrag_original=${c.betrag_original} start=${c.start_datum}`,
        );
      }
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY-RUN. Nichts geschrieben. --apply zum Anwenden.");
    return;
  }

  // 4) Apply
  console.log(`Schreibe ${updates.length} betrag-Updates …`);
  let ok = 0;
  let failed = 0;
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from("deals")
      .update({ betrag: u.newBetrag })
      .eq("id", u.deal.id);
    if (updErr) {
      console.error(`  ✗ ${u.src.email}: ${updErr.message}`);
      failed++;
    } else {
      ok++;
    }
  }
  console.log(`Fertig. OK=${ok}, fehlgeschlagen=${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
