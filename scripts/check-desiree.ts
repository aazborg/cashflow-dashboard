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
      "id, vorname, nachname, email, betrag, betrag_original, start_datum, hubspot_deal_id, source, created_at",
    )
    .ilike("email", "deduchek@hotmail.com");
  for (const d of (data ?? []) as Array<Record<string, unknown>>) {
    console.log(d);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
