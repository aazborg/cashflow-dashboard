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
      "id, vorname, nachname, email, betrag, betrag_original, hubspot_deal_id, start_datum, source, created_at, pending_delete",
    );
  const deals = (data ?? []) as any[];
  // Group by (vorname + nachname) — find dupes that differ in email/source
  const byKey = new Map<string, any[]>();
  for (const d of deals) {
    const k = `${(d.vorname ?? "").toLowerCase().trim()}|${(d.nachname ?? "").toLowerCase().trim()}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(d);
  }
  const dupes = [...byKey.entries()].filter(([, v]) => v.length > 1);
  console.log(`Personen mit mehreren Einträgen: ${dupes.length}`);
  let truedupe = 0;
  let multidealsdiff = 0;
  for (const [key, rows] of dupes) {
    // True dupes: same start_datum + same betrag_original
    const byStartOrig = new Map<string, any[]>();
    for (const r of rows) {
      const k = `${r.start_datum}|${r.betrag_original}`;
      if (!byStartOrig.has(k)) byStartOrig.set(k, []);
      byStartOrig.get(k)!.push(r);
    }
    const dupeGroups = [...byStartOrig.values()].filter((g) => g.length > 1);
    if (dupeGroups.length > 0) {
      truedupe++;
      console.log(`\n[DUPE] ${key} — ${rows.length} Zeilen, davon ${dupeGroups.length} Dupe-Gruppe(n):`);
      for (const g of dupeGroups) {
        console.log(`  Dupe-Gruppe (start=${g[0].start_datum} orig=${g[0].betrag_original}):`);
        for (const r of g) {
          console.log(`    id=${r.id.slice(0,8)} email=${r.email ?? "<leer>"} betrag=${r.betrag} source=${r.source} hs_id=${r.hubspot_deal_id ?? "<leer>"} created=${(r.created_at as string).slice(0,10)} pending=${r.pending_delete}`);
        }
      }
    } else {
      multidealsdiff++;
    }
  }
  console.log(`\n→ Echte Dupes: ${truedupe} Personen`);
  console.log(`→ Mehrere unterschiedliche Deals: ${multidealsdiff} Personen`);
}
main().catch((e) => { console.error(e); process.exit(1); });
