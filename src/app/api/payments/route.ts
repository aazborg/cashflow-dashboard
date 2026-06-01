/**
 * Liest GoCardless-Payments aus dem Supabase-Cache
 * (gocardless_payments_cache). Der Cache wird vom Mac-Mini-Bot alle
 * 30 Min via gocardless_sync.py befuellt.
 *
 * Vorher: /api/bot/gocardless/all-payments -> Bot -> Live-GC -> ~17s
 * Jetzt: direkter Supabase-Read -> <500ms.
 *
 * Permission: gleiche Regel wie der alte Bot-Endpoint
 * (canUseRechnungsBot -- Admins + Accounting + Sales).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionContext } from "@/lib/supabase-server";
import { canUseRechnungsBot } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface CacheRow {
  gc_id: string;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  charge_date: string | null;
  description: string | null;
  reference: string | null;
  created_at_gc: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  mitarbeiter: string | null;
  deal_id: string | null;
  mandate_id: string | null;
  subscription_id: string | null;
  instalment_schedule_id: string | null;
  env: string | null;
  synced_at: string | null;
}

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!canUseRechnungsBot(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = supabaseAdmin();
  const { data, error, count } = await sb
    .from("gocardless_payments_cache")
    .select(
      "gc_id,amount_cents,currency,status,charge_date,description," +
        "reference,created_at_gc,customer_id,customer_name," +
        "customer_email,mitarbeiter,deal_id,mandate_id," +
        "subscription_id,instalment_schedule_id,env,synced_at",
      { count: "exact" },
    )
    .order("charge_date", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }

  // Auf das Format mappen das das Frontend vom Bot-Endpoint kennt.
  const rows = (data ?? []) as CacheRow[];
  const synced = rows.length > 0 ? rows[0].synced_at : null;
  const env = rows.length > 0 ? rows[0].env : "live";
  const payments = rows.map((r) => ({
    id: r.gc_id,
    amount_cents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    charge_date: r.charge_date,
    description: r.description,
    reference: r.reference,
    created_at: r.created_at_gc,
    customer_id: r.customer_id,
    customer_name: r.customer_name ?? "—",
    customer_email: r.customer_email,
    mitarbeiter: r.mitarbeiter,
    deal_id: r.deal_id,
    mandate_id: r.mandate_id,
    subscription_id: r.subscription_id,
    instalment_schedule_id: r.instalment_schedule_id,
  }));

  return NextResponse.json({
    env,
    count: count ?? payments.length,
    synced_at: synced,
    payments,
  });
}
