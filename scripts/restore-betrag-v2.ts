/**
 * Restore-Betrag v2: aktualisiert betrag auf ALLEN matchenden DB-Zeilen
 * (also auch bei HubSpot-Duplikat-Zeilen, die das gleiche start_datum haben
 * wie die manuell angelegte Zeile mit Email).
 *
 * Quelle: scripts/restore_betrag_data.json (aus dem XLSX-Backup extrahiert).
 *
 * Aufruf:
 *   npx dotenv-cli -e .env.local -- tsx scripts/restore-betrag-v2.ts        # dry-run
 *   npx dotenv-cli -e .env.local -- tsx scripts/restore-betrag-v2.ts --apply
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
  start_datum: string | null;
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
  source: string;
  pending_delete: boolean;
}

const APPLY = process.argv.includes("--apply");

function need(k: string): string {
  const v = process.env[k];
  if (!v) {
    console.error(`ENV ${k} fehlt`);
    process.exit(1);
  }
  return v;
}

function normKey(s: string): string {
  return s.toLowerCase().trim().replace(/,.*$/, "").trim();
}

async function main(): Promise<void> {
  const sb = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });

  const xlsxRows = JSON.parse(
    readFileSync(
      new URL("./restore_betrag_data.json", import.meta.url),
      "utf-8",
    ),
  ) as XlsxRow[];

  const { data: dealsRaw, error } = await sb
    .from("deals")
    .select(
      "id, vorname, nachname, email, mitarbeiter_id, mitarbeiter_name, betrag, betrag_original, start_datum, hubspot_deal_id, source, pending_delete",
    );
  if (error) throw error;
  const deals = (dealsRaw ?? []) as DbDeal[];

  const byEmail = new Map<string, DbDeal[]>();
  for (const d of deals) {
    if (!d.email) continue;
    const k = d.email.toLowerCase().trim();
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k)!.push(d);
  }
  const byNachname = new Map<string, DbDeal[]>();
  for (const d of deals) {
    if (!d.nachname) continue;
    const k = normKey(d.nachname);
    if (!byNachname.has(k)) byNachname.set(k, []);
    byNachname.get(k)!.push(d);
  }

  function firstToken(s: string | null): string {
    return s ? normKey(s).split(/\s+/)[0] : "";
  }

  function findByName(src: XlsxRow): DbDeal[] {
    if (!src.nachname) return [];
    const srcLast = normKey(src.nachname);
    if (!srcLast) return [];
    const srcFirst = firstToken(src.vorname);
    return deals.filter((d) => {
      if (!d.nachname) return false;
      const dLast = normKey(d.nachname);
      const lastOk =
        dLast === srcLast || dLast.includes(srcLast) || srcLast.includes(dLast);
      if (!lastOk) return false;
      // Vorname-Pflicht-Check: erste Tokens müssen sich entsprechen.
      // Verhindert, dass z.B. "Carina Burgstaller" auf "Nina Burgstaller"
      // matcht.
      if (srcFirst && d.vorname) {
        const dFirst = firstToken(d.vorname);
        const firstOk =
          dFirst === srcFirst ||
          dFirst.includes(srcFirst) ||
          srcFirst.includes(dFirst);
        if (!firstOk) return false;
      }
      return true;
    });
  }

  type PlanItem = {
    src: XlsxRow;
    deal: DbDeal;
    newBetrag: number;
    via: "email" | "name+month";
  };
  const willUpdate: PlanItem[] = [];
  const willNoop: PlanItem[] = [];
  const noMatch: XlsxRow[] = [];
  const usedDealIds = new Set<string>();

  // Sortiere XLSX-Rows: zuerst mit start_datum, dann ohne (damit Multi-Deal-
  // Fälle ihre spezifische Zeile zuerst bekommen).
  const sortedSrc = [...xlsxRows].sort((a, b) => {
    if (a.start_datum && !b.start_datum) return -1;
    if (!a.start_datum && b.start_datum) return 1;
    return 0;
  });

  for (const src of sortedSrc) {
    // Skip platzhalter
    if (
      src.betrag === 0 &&
      !src.start_datum &&
      !src.intervall &&
      !src.anzahl_raten
    ) {
      continue;
    }

    // 1) email match
    const emailMatches = (byEmail.get(src.email) ?? []).filter(
      (d) => !d.pending_delete,
    );
    // 2) name+month match (fängt DB-Zeilen ohne Email ab)
    const nameMatches = findByName(src).filter((d) => !d.pending_delete);

    // Kombinieren, dedupliziert
    const combined: DbDeal[] = [];
    const seenIds = new Set<string>();
    for (const d of [...emailMatches, ...nameMatches]) {
      if (seenIds.has(d.id)) continue;
      seenIds.add(d.id);
      combined.push(d);
    }
    if (combined.length === 0) {
      noMatch.push(src);
      continue;
    }

    // Filter nach Start-Monat: bevorzuge die Zeilen mit gleichem Monat
    const srcMonth = src.start_datum?.slice(0, 7) ?? null;
    let final: DbDeal[];
    if (srcMonth) {
      const sameMonth = combined.filter(
        (d) => d.start_datum?.slice(0, 7) === srcMonth,
      );
      if (sameMonth.length > 0) final = sameMonth;
      else final = combined; // kein DB-Match auf Monat → alle nehmen
    } else {
      final = combined;
    }

    // Filter: noch nicht von vorheriger XLSX-Zeile beansprucht
    final = final.filter((d) => !usedDealIds.has(d.id));
    if (final.length === 0) {
      // Ein vorheriger XLSX-Eintrag hat die Zeilen schon "konsumiert"
      noMatch.push(src);
      continue;
    }

    for (const deal of final) {
      const via: "email" | "name+month" = emailMatches.find((m) => m.id === deal.id)
        ? "email"
        : "name+month";
      usedDealIds.add(deal.id);
      const item: PlanItem = { src, deal, newBetrag: src.betrag, via };
      if (Math.abs(deal.betrag - src.betrag) < 0.005) willNoop.push(item);
      else willUpdate.push(item);
    }
  }

  console.log("");
  console.log(`XLSX-Rows verarbeitet: ${sortedSrc.length}`);
  console.log(`  → werden aktualisiert (Wert ändert sich): ${willUpdate.length}`);
  console.log(`  → bereits korrekt:                       ${willNoop.length}`);
  console.log(`  → kein DB-Match gefunden:                ${noMatch.length}`);
  console.log("");

  if (willUpdate.length > 0) {
    console.log("Updates:");
    for (const u of willUpdate) {
      console.log(
        `  [${u.via.padEnd(10)}] ${u.deal.vorname} ${u.deal.nachname}  ` +
          `betrag ${u.deal.betrag} → ${u.newBetrag}  ` +
          `(orig=${u.deal.betrag_original} src=${u.deal.source} email=${u.deal.email ?? "<leer>"} start=${u.deal.start_datum})`,
      );
    }
    console.log("");
  }
  if (noMatch.length > 0) {
    console.log("Kein DB-Match gefunden:");
    for (const n of noMatch) {
      console.log(
        `  ${n.vorname} ${n.nachname}  email=${n.email}  betrag=${n.betrag}`,
      );
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY-RUN. --apply zum Schreiben.");
    return;
  }

  console.log(`Schreibe ${willUpdate.length} Updates …`);
  let ok = 0,
    failed = 0;
  for (const u of willUpdate) {
    const { error: e } = await sb
      .from("deals")
      .update({ betrag: u.newBetrag })
      .eq("id", u.deal.id);
    if (e) {
      console.error(`  ✗ ${u.deal.vorname} ${u.deal.nachname}: ${e.message}`);
      failed++;
    } else ok++;
  }
  console.log(`Fertig. OK=${ok} Fehler=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
