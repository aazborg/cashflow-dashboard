/**
 * Einmalig: zwei versehentlich gelöschte Deals wieder anlegen.
 *
 * Aufruf:
 *   npx dotenv-cli -e .env.local -- tsx scripts/reinsert-deals.ts        # dry-run
 *   npx dotenv-cli -e .env.local -- tsx scripts/reinsert-deals.ts --apply
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const APPLY = process.argv.includes("--apply");

const TO_INSERT = [
  {
    vorname: "Andrea",
    nachname: "Hinterberger",
    email: "andreahinterberger46@gmail.com",
    mitarbeiter_id: "30233227",
    mitarbeiter_name: "Caroline Ramberger",
    betrag: 14252.63,
    start_datum: null as string | null,
    anzahl_raten: null as number | null,
    intervall: null as string | null,
  },
  {
    vorname: "Desiree",
    nachname: "Duchek, MA",
    email: "deduchek@hotmail.com",
    mitarbeiter_id: "30911203",
    mitarbeiter_name: "Chiara Valentini",
    betrag: 4960,
    start_datum: "2026-06-01",
    anzahl_raten: 1,
    intervall: "Einmalzahlung" as string | null,
  },
];

async function main(): Promise<void> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: ws as unknown as typeof WebSocket },
    },
  );

  console.log("Einzufügen:");
  for (const d of TO_INSERT) {
    console.log(
      `  ${d.vorname} ${d.nachname}  email=${d.email}  betrag=${d.betrag}  start=${d.start_datum ?? "—"}  intervall=${d.intervall ?? "—"}  raten=${d.anzahl_raten ?? "—"}`,
    );
  }
  console.log("");

  // Prüfen ob die schon existieren (defensive)
  for (const d of TO_INSERT) {
    const { data: existing } = await sb
      .from("deals")
      .select("id, vorname, nachname, betrag, source")
      .eq("email", d.email)
      .ilike("nachname", `%${d.nachname.split(",")[0].trim()}%`);
    if (existing && existing.length > 0) {
      console.log(
        `  ⚠ ${d.vorname} ${d.nachname}: bereits ${existing.length} Eintrag/Einträge mit Email + Nachname. Trotzdem fortfahren?`,
      );
      for (const e of existing) {
        console.log(
          `    bestehend: id=${(e.id as string).slice(0, 8)} ${e.vorname} ${e.nachname} betrag=${e.betrag} source=${e.source}`,
        );
      }
    }
  }
  console.log("");

  if (!APPLY) {
    console.log("DRY-RUN. --apply zum Einfügen.");
    return;
  }

  for (const d of TO_INSERT) {
    const { data, error } = await sb
      .from("deals")
      .insert({
        vorname: d.vorname,
        nachname: d.nachname,
        email: d.email,
        mitarbeiter_id: d.mitarbeiter_id,
        mitarbeiter_name: d.mitarbeiter_name,
        betrag: d.betrag,
        betrag_original: d.betrag,
        start_datum: d.start_datum,
        anzahl_raten: d.anzahl_raten,
        intervall: d.intervall,
        hubspot_deal_id: null,
        source: "manual",
        pending_delete: false,
      })
      .select()
      .single();
    if (error) {
      console.error(`  ✗ ${d.vorname} ${d.nachname}: ${error.message}`);
    } else {
      console.log(
        `  ✓ ${d.vorname} ${d.nachname}: angelegt (id=${(data.id as string).slice(0, 8)})`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
