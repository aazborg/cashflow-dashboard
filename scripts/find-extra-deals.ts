/**
 * Findet DB-Deals, die NICHT im XLSX-Backup vorkommen.
 * Heuristik: für jeden DB-Deal nach (email, vorname+nachname+mitarbeiter_id)
 * im XLSX suchen. Wenn kein Match → "Extra" (neu seit Backup ODER Dupe).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

interface XlsxRow {
  vorname: string | null;
  nachname: string | null;
  mitarbeiter_id: string | null;
  email: string;
  betrag: number;
}
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

function normLast(s: string | null): string {
  return (s ?? "").toLowerCase().trim().replace(/,.*$/, "").trim();
}
function normFirst(s: string | null): string {
  return (s ?? "").toLowerCase().trim().split(/\s+/)[0] ?? "";
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

  const xlsx = JSON.parse(
    readFileSync(
      new URL("./restore_betrag_data.json", import.meta.url),
      "utf-8",
    ),
  ) as XlsxRow[];

  const { data, error } = await sb
    .from("deals")
    .select(
      "id, vorname, nachname, email, mitarbeiter_id, mitarbeiter_name, betrag, betrag_original, start_datum, hubspot_deal_id, source, pending_delete, created_at",
    );
  if (error) throw error;
  const deals = (data ?? []) as DealRow[];

  // Cashflow-Alt-Einträge sind keine Deals — separat zählen
  const cashflowAlt = deals.filter((d) => d.vorname?.toLowerCase().trim() === "cashflow alt");
  const realDeals = deals.filter((d) => d.vorname?.toLowerCase().trim() !== "cashflow alt");

  // XLSX-Index nach Email + nach Name
  const xlsxByEmail = new Set<string>();
  const xlsxByNameKey = new Set<string>();
  for (const x of xlsx) {
    if (x.email) xlsxByEmail.add(x.email.toLowerCase().trim());
    if (x.vorname && x.nachname) {
      xlsxByNameKey.add(
        `${normFirst(x.vorname)}|${normLast(x.nachname)}|${x.mitarbeiter_id ?? ""}`,
      );
    }
  }

  console.log(`DB total: ${deals.length}`);
  console.log(`  davon Cashflow-Alt-Einträge: ${cashflowAlt.length}`);
  console.log(`  echte Deals: ${realDeals.length}`);
  console.log(`XLSX-Real-Deal-Zeilen: ${xlsx.length}`);
  console.log("");

  const notInXlsx: DealRow[] = [];
  for (const d of realDeals) {
    const emailHit = d.email && xlsxByEmail.has(d.email.toLowerCase().trim());
    const nameKey = `${normFirst(d.vorname)}|${normLast(d.nachname)}|${d.mitarbeiter_id}`;
    const nameHit = xlsxByNameKey.has(nameKey);
    if (!emailHit && !nameHit) notInXlsx.push(d);
  }
  console.log(`DB-Deals OHNE XLSX-Pendant (neu seit Backup oder verdächtig): ${notInXlsx.length}`);
  for (const d of notInXlsx) {
    console.log(
      `  id=${d.id.slice(0, 8)} ${d.vorname} ${d.nachname} email=${d.email ?? "<leer>"} betrag=${d.betrag} orig=${d.betrag_original} start=${d.start_datum} hs=${d.hubspot_deal_id ?? "<leer>"} src=${d.source} created=${d.created_at.slice(0, 10)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
