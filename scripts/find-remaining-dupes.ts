/**
 * Sucht potenzielle Duplikate mit mehreren Heuristiken:
 *   - same email
 *   - same vorname + nachname + mitarbeiter_id (ohne start-Filter)
 *   - same hubspot_deal_id
 */
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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
  console.log(`Total deals in DB: ${deals.length}`);
  console.log("");

  // --- 1) Same email ---
  const byEmail = new Map<string, DealRow[]>();
  for (const d of deals) {
    if (!d.email) continue;
    const k = d.email.toLowerCase().trim();
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k)!.push(d);
  }
  const emailDupes = [...byEmail.entries()].filter(([, v]) => v.length > 1);
  console.log(`=== Mehrere Einträge pro EMAIL: ${emailDupes.length} ===`);
  for (const [email, rows] of emailDupes) {
    console.log(`\n  ${email} (${rows.length} Zeilen):`);
    for (const r of rows) {
      console.log(
        `    id=${r.id.slice(0, 8)} ${r.vorname} ${r.nachname} betrag=${r.betrag} orig=${r.betrag_original} start=${r.start_datum} hs=${r.hubspot_deal_id ?? "<leer>"} src=${r.source} pending=${r.pending_delete}`,
      );
    }
  }

  // --- 2) Same vorname + nachname + mitarbeiter_id ---
  console.log("");
  console.log("");
  const byName = new Map<string, DealRow[]>();
  for (const d of deals) {
    const k = [
      (d.vorname ?? "").toLowerCase().trim(),
      (d.nachname ?? "").toLowerCase().trim().replace(/,.*$/, "").trim(),
      d.mitarbeiter_id,
    ].join("|");
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(d);
  }
  const nameDupes = [...byName.entries()].filter(([, v]) => v.length > 1);
  console.log(`=== Mehrere Einträge pro vorname+nachname+mitarbeiter: ${nameDupes.length} ===`);
  for (const [key, rows] of nameDupes) {
    // Wenn alle die gleiche email haben, schon oben gemeldet; nur unklare Fälle zeigen
    const allEmails = new Set(rows.map((r) => r.email?.toLowerCase() ?? "<none>"));
    if (allEmails.size === 1 && [...allEmails][0] !== "<none>") continue; // schon in email-block
    console.log(`\n  ${key}:`);
    for (const r of rows) {
      console.log(
        `    id=${r.id.slice(0, 8)} email=${r.email ?? "<leer>"} betrag=${r.betrag} orig=${r.betrag_original} start=${r.start_datum} hs=${r.hubspot_deal_id ?? "<leer>"} src=${r.source} pending=${r.pending_delete}`,
      );
    }
  }

  // --- 3) Same hubspot_deal_id (should NEVER happen — Unique constraint) ---
  console.log("");
  console.log("");
  const byHs = new Map<string, DealRow[]>();
  for (const d of deals) {
    if (!d.hubspot_deal_id) continue;
    if (!byHs.has(d.hubspot_deal_id)) byHs.set(d.hubspot_deal_id, []);
    byHs.get(d.hubspot_deal_id)!.push(d);
  }
  const hsDupes = [...byHs.entries()].filter(([, v]) => v.length > 1);
  console.log(`=== Mehrere Einträge pro hubspot_deal_id: ${hsDupes.length} (sollte 0 sein) ===`);
  for (const [hs, rows] of hsDupes) {
    console.log(`  ${hs}: ${rows.length} Zeilen`);
    for (const r of rows) {
      console.log(`    id=${r.id.slice(0, 8)} ${r.vorname} ${r.nachname} betrag=${r.betrag}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
