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
  const names: Array<[string, string]> = [
    ["Ilse", "Steinlesberger"],
    ["Sabine", "Riesenhuber"],
    ["Sofia", "Dostal"],
    ["Eleonora", "Zar"],
    ["Marlene", "Fraberger"],
    ["Mira", "Hasenöhrl"],
    ["Simone", "Karrer"],
    ["Markus", "Hausl"],
    ["Isabelle", "Hochauer"],
    ["Andrea", "Hinterberger"],
    ["Desiree", "Duchek"],
  ];
  for (const [v, n] of names) {
    const { data } = await sb
      .from("deals")
      .select(
        "id, vorname, nachname, email, betrag, betrag_original, hubspot_deal_id, pending_delete",
      )
      .ilike("nachname", `%${n}%`);
    if (data && data.length > 0) {
      console.log(`${v} ${n}:`);
      for (const d of data)
        console.log(
          `  id=${(d.id as string).slice(0, 8)} ${d.vorname} ${d.nachname} email=${d.email ?? "<leer>"} betrag=${d.betrag} betrag_original=${d.betrag_original} hs=${d.hubspot_deal_id ?? "<leer>"} ${d.pending_delete ? "PENDING_DELETE" : ""}`,
        );
    } else {
      console.log(`${v} ${n}: keine Treffer`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
