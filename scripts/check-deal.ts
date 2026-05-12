import { createClient } from "@supabase/supabase-js";
import ws from "ws";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: ws as unknown as typeof WebSocket },
    },
  );
  const targets = [
    "elena.kopatz@gmail.com",
    "a.malfer@aon.at",
    "michael.klauninger@gmx.at",
    "carina.zwahr@icloud.com",
    "baueka@gmail.com",
    "office@maennerfragen.at",
    "elena.rausch@outlook.com",
  ];
  const allDeals = await sb.from("deals").select("id, vorname, nachname, email, betrag, betrag_original, hubspot_deal_id, start_datum, pending_delete");
  if (allDeals.error) throw allDeals.error;
  const deals = allDeals.data as any[];
  // Match by exact email AND by name fallback
  for (const email of targets) {
    const byEmail = deals.filter((d) => (d.email ?? "").toLowerCase() === email);
    const lastName = email.includes("@") ? null : email;
    console.log(`\n=== ${email} ===`);
    if (byEmail.length > 0) {
      for (const d of byEmail) console.log(`  by email: id=${d.id.slice(0,8)} ${d.vorname} ${d.nachname} email=${d.email} betrag=${d.betrag} orig=${d.betrag_original} start=${d.start_datum} pending=${d.pending_delete}`);
    } else {
      console.log("  by email: keine Treffer");
    }
  }
  // Also list all deals with same nachname for the screenshot names
  const lastNames = ["Kopatz","Malfer","Klauninger","Zwahr","Bauerstätter","Schwarzl","Rausch","Hofer"];
  for (const n of lastNames) {
    const matches = deals.filter((d) => d.nachname?.toLowerCase().includes(n.toLowerCase()));
    console.log(`\n--- Nachname-Suche: ${n} ---`);
    for (const d of matches) console.log(`  id=${d.id.slice(0,8)} ${d.vorname} ${d.nachname} email=${d.email ?? "<leer>"} betrag=${d.betrag} orig=${d.betrag_original} start=${d.start_datum} pending=${d.pending_delete}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
