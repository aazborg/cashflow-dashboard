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
  const { data } = await sb
    .from("deals")
    .select(
      "id, vorname, nachname, mitarbeiter_id, mitarbeiter_name, betrag, betrag_original, start_datum, source, hubspot_deal_id, pending_delete",
    )
    .ilike("vorname", "Cashflow Alt%");
  const deals = (data ?? []) as any[];
  console.log(`Cashflow-Alt-Einträge in DB: ${deals.length}`);
  for (const d of deals) {
    console.log(
      `  id=${d.id.slice(0, 8)} ${d.vorname} / ${d.nachname} mit=${d.mitarbeiter_id} (${d.mitarbeiter_name}) betrag=${d.betrag} orig=${d.betrag_original} src=${d.source} start=${d.start_datum} pending=${d.pending_delete}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
