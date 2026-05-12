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
  const names = ["Riesenhuber", "Hasenöhrl", "Duchek"];
  for (const n of names) {
    const { data, error } = await sb
      .from("deals")
      .select(
        "id, vorname, nachname, email, betrag, betrag_original, hubspot_deal_id, pending_delete, created_at",
      )
      .ilike("nachname", `%${n}%`);
    if (error) {
      console.log(`${n}: ERROR ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) {
      console.log(`${n}: keine Treffer`);
      continue;
    }
    for (const d of data) {
      console.log(
        `id=${(d.id as string).slice(0, 8)} ${d.vorname} ${d.nachname} betrag=${d.betrag} betrag_original=${d.betrag_original} email=${d.email ?? "<leer>"} pending=${d.pending_delete} created=${(d.created_at as string).slice(0, 10)}`,
      );
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
