/**
 * One-shot migration: data/db.json → Supabase.
 * Run via: npx tsx scripts/migrate-db-to-supabase.ts
 *
 * Reads .env.local for credentials. Uses the secret key. Idempotent:
 * uses upsert with onConflict on natural keys, so re-runs are safe.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import WS from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WS }).WebSocket = WS;
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !SECRET) {
  console.error("Missing env vars. Run with: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-db-to-supabase.ts");
  process.exit(1);
}

const sb = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const raw = await fs.readFile(path.join(process.cwd(), "data/db.json"), "utf8");
  const db = JSON.parse(raw);

  console.log(`Source: ${db.employees?.length ?? 0} employees, ${db.deals?.length ?? 0} deals, ${db.products?.length ?? 0} products, ${db.monthly_snapshots?.length ?? 0} snapshots, ${db.delete_requests?.length ?? 0} delete_requests`);

  // employees — upsert by email
  if (db.employees?.length) {
    const rows = db.employees.map((e: Record<string, unknown>) => ({
      id: e.id,
      email: (e.email as string).toLowerCase(),
      name: e.name,
      hubspot_owner_id: e.hubspot_owner_id ?? null,
      role: e.role ?? "member",
      invited_at: e.invited_at ?? new Date().toISOString(),
      active: e.active ?? true,
      provision_pct: e.provision_pct ?? null,
      default_qualis: e.default_qualis ?? null,
      default_showup_rate: e.default_showup_rate ?? null,
      default_close_rate: e.default_close_rate ?? null,
      default_avg_contract: e.default_avg_contract ?? null,
    }));
    const { error } = await sb.from("employees").upsert(rows, { onConflict: "email" });
    if (error) throw error;
    console.log(`✓ employees: ${rows.length}`);
  }

  // products — upsert by id (so re-runs don't duplicate)
  if (db.products?.length) {
    const rows = db.products.map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      default_anzahl_raten: p.default_anzahl_raten ?? null,
      default_intervall: p.default_intervall ?? null,
      active: p.active ?? true,
      is_upsell: p.is_upsell ?? false,
      sort: p.sort ?? 0,
    }));
    const { error } = await sb.from("products").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    console.log(`✓ products: ${rows.length}`);
  }

  // deals — upsert by id (preserve UUIDs so delete_requests FKs match)
  if (db.deals?.length) {
    const rows = db.deals.map((d: Record<string, unknown>) => ({
      id: d.id,
      vorname: d.vorname,
      nachname: d.nachname,
      email: d.email ?? null,
      mitarbeiter_id: d.mitarbeiter_id,
      mitarbeiter_name: d.mitarbeiter_name,
      betrag: d.betrag,
      start_datum: d.start_datum ?? null,
      anzahl_raten: d.anzahl_raten ?? null,
      intervall: d.intervall ?? null,
      hubspot_deal_id: d.hubspot_deal_id ?? null,
      source: d.source ?? "manual",
      pending_delete: d.pending_delete ?? false,
      created_at: d.created_at ?? new Date().toISOString(),
    }));
    // Chunk to avoid huge payloads
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await sb.from("deals").upsert(slice, { onConflict: "id" });
      if (error) throw error;
    }
    console.log(`✓ deals: ${rows.length}`);
  }

  // monthly_snapshots — upsert by mitarbeiter_id+month
  if (db.monthly_snapshots?.length) {
    const rows = db.monthly_snapshots.map((s: Record<string, unknown>) => ({
      id: s.id,
      mitarbeiter_id: s.mitarbeiter_id,
      month: s.month,
      qualis: s.qualis,
      showup_rate: s.showup_rate,
      close_rate: s.close_rate,
      avg_contract: s.avg_contract ?? null,
    }));
    const { error } = await sb.from("monthly_snapshots").upsert(rows, { onConflict: "mitarbeiter_id,month" });
    if (error) throw error;
    console.log(`✓ monthly_snapshots: ${rows.length}`);
  }

  // delete_requests — upsert by id
  if (db.delete_requests?.length) {
    const rows = db.delete_requests.map((r: Record<string, unknown>) => ({
      id: r.id,
      deal_id: r.deal_id,
      requested_by_email: (r.requested_by_email as string).toLowerCase(),
      requested_at: r.requested_at,
      status: r.status,
      decided_at: r.decided_at ?? null,
    }));
    const { error } = await sb.from("delete_requests").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    console.log(`✓ delete_requests: ${rows.length}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
