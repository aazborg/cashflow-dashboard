/**
 * Merged manuelle Deals (ohne hubspot_deal_id, häufig mit Email) mit ihren
 * automatisch importierten HubSpot-Duplikaten (mit hubspot_deal_id, oft
 * ohne Email).
 *
 * Strategie pro Match-Paar:
 *   - manual-Zeile bleibt erhalten — sie trägt den vom Mitarbeiter
 *     gepflegten betrag (Provisionsbasis) und i.d.R. anzahl_raten,
 *     intervall, start_datum
 *   - hubspot_deal_id wird auf die manual-Zeile übertragen
 *   - betrag_original wird auf den HubSpot-Wert nachgezogen (Truth)
 *   - email wird übernommen, wenn die manual-Zeile keine hat
 *   - hubspot-Zeile wird hard-gelöscht
 *
 * Match-Heuristik:
 *   Gruppe nach (vorname-lower, nachname-lower, mitarbeiter_id, start_datum-monat).
 *   Innerhalb: genau 1 manual + 1 hubspot → automatisch zusammenführen.
 *   Sonst: skippen (ambig, manuelle Sichtung nötig).
 *
 * Aufruf:
 *   npx dotenv-cli -e .env.local -- tsx scripts/merge-duplicates.ts        # dry-run
 *   npx dotenv-cli -e .env.local -- tsx scripts/merge-duplicates.ts --apply
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const APPLY = process.argv.includes("--apply");

interface DealRow {
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
  created_at: string;
}

function groupKey(d: DealRow): string {
  return [
    d.vorname?.toLowerCase().trim() ?? "",
    d.nachname?.toLowerCase().trim() ?? "",
    d.mitarbeiter_id ?? "",
    d.start_datum?.slice(0, 7) ?? "—",
  ].join("|");
}

async function main(): Promise<void> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: ws as unknown as typeof WebSocket },
    },
  );

  const { data, error } = await sb
    .from("deals")
    .select(
      "id, vorname, nachname, email, mitarbeiter_id, mitarbeiter_name, betrag, betrag_original, start_datum, hubspot_deal_id, source, pending_delete, created_at",
    );
  if (error) throw error;
  const deals = (data ?? []) as DealRow[];

  const groups = new Map<string, DealRow[]>();
  for (const d of deals) {
    const k = groupKey(d);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }

  type Plan = {
    keep: DealRow;
    drop: DealRow;
    setHubspotId: string;
    setBetragOriginal: number;
    setEmail?: string | null;
  };
  const plans: Plan[] = [];
  const ambiguous: { key: string; rows: DealRow[] }[] = [];

  for (const [key, rows] of groups) {
    if (rows.length === 1) continue;
    const manual = rows.filter(
      (r) => !r.hubspot_deal_id && !r.pending_delete,
    );
    const hubspot = rows.filter(
      (r) => r.hubspot_deal_id && !r.pending_delete,
    );
    // Saubere 1-zu-1-Konstellation
    if (manual.length === 1 && hubspot.length === 1) {
      const m = manual[0];
      const h = hubspot[0];
      plans.push({
        keep: m,
        drop: h,
        setHubspotId: h.hubspot_deal_id!,
        setBetragOriginal: Number(h.betrag_original ?? h.betrag),
        setEmail: m.email ?? h.email,
      });
      continue;
    }
    // Sonstige Mehrfachfälle als ambig markieren
    if (rows.length > 1) ambiguous.push({ key, rows });
  }

  console.log("");
  console.log(`Gruppen mit mehreren Zeilen: ${[...groups.values()].filter((g) => g.length > 1).length}`);
  console.log(`  → eindeutig mergebare 1-zu-1-Paare: ${plans.length}`);
  console.log(`  → ambige (≠ 1 manual + 1 hubspot):  ${ambiguous.length}`);
  console.log("");

  if (plans.length > 0) {
    console.log("Merge-Plan:");
    for (const p of plans) {
      console.log(
        `  KEEP id=${p.keep.id.slice(0, 8)} ${p.keep.vorname} ${p.keep.nachname} betrag=${p.keep.betrag} email=${p.keep.email ?? "<leer>"} src=${p.keep.source}`,
      );
      console.log(
        `    + setHubspotId=${p.setHubspotId} setBetragOrig=${p.setBetragOriginal}${!p.keep.email && p.drop.email ? " + email aus hubspot übernehmen" : ""}`,
      );
      console.log(
        `  DROP id=${p.drop.id.slice(0, 8)} ${p.drop.vorname} ${p.drop.nachname} betrag=${p.drop.betrag} email=${p.drop.email ?? "<leer>"} hs=${p.drop.hubspot_deal_id}`,
      );
    }
    console.log("");
  }

  if (ambiguous.length > 0) {
    console.log("Ambige Gruppen (manuell prüfen):");
    for (const { key, rows } of ambiguous.slice(0, 20)) {
      console.log(`  ${key}:`);
      for (const r of rows) {
        console.log(
          `    id=${r.id.slice(0, 8)} betrag=${r.betrag} orig=${r.betrag_original} email=${r.email ?? "<leer>"} hs=${r.hubspot_deal_id ?? "<leer>"} src=${r.source} pending=${r.pending_delete}`,
        );
      }
    }
    if (ambiguous.length > 20) {
      console.log(`  … und ${ambiguous.length - 20} weitere Gruppen`);
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY-RUN. --apply zum Ausführen.");
    return;
  }

  let merged = 0,
    failed = 0;
  for (const p of plans) {
    try {
      // 1) DROP-Zeile aus delete_requests aufräumen, falls vorhanden
      await sb.from("delete_requests").delete().eq("deal_id", p.drop.id);
      // 2) DROP löschen
      const { error: e1 } = await sb.from("deals").delete().eq("id", p.drop.id);
      if (e1) throw e1;
      // 3) KEEP patchen (hubspot_deal_id, betrag_original, ggf. email)
      const patch: Record<string, unknown> = {
        hubspot_deal_id: p.setHubspotId,
        betrag_original: p.setBetragOriginal,
      };
      if (!p.keep.email && p.setEmail) patch.email = p.setEmail;
      const { error: e2 } = await sb.from("deals").update(patch).eq("id", p.keep.id);
      if (e2) throw e2;
      merged++;
    } catch (err) {
      console.error(
        `  ✗ ${p.keep.vorname} ${p.keep.nachname}: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed++;
    }
  }
  console.log(`Fertig. Merges=${merged} Fehler=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
