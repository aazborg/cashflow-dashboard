/**
 * Liest GoCardless-Mandate aus dem Supabase-Cache
 * (gocardless_mandates_cache). Cache-Befuellung: gocardless_sync.py.
 *
 * Permission: gleiche Regel wie der alte Bot-Endpoint.
 *
 * Query-Param 'status': comma-separated Whitelist
 * (z.B. ?status=cancelled,expired,blocked fuer den
 * 'Mandate geloescht'-Tab).
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionContext } from "@/lib/supabase-server";
import { canUseRechnungsBot } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface CacheRow {
  gc_id: string;
  status: string | null;
  scheme: string | null;
  reference: string | null;
  created_at_gc: string | null;
  next_possible_charge_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  mitarbeiter: string | null;
  deal_id: string | null;
  env: string | null;
  synced_at: string | null;
}

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!canUseRechnungsBot(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = (url.searchParams.get("status") || "").trim();
  const statuses = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const sb = supabaseAdmin();
  let q = sb
    .from("gocardless_mandates_cache")
    .select(
      "gc_id,status,scheme,reference,created_at_gc," +
        "next_possible_charge_date,customer_id,customer_name," +
        "customer_email,mitarbeiter,deal_id,env,synced_at",
      { count: "exact" },
    )
    .order("created_at_gc", { ascending: false, nullsFirst: false });
  if (statuses.length > 0) {
    q = q.in("status", statuses);
  }

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as CacheRow[];
  const synced = rows.length > 0 ? rows[0].synced_at : null;
  const env = rows.length > 0 ? rows[0].env : "live";
  const mandates = rows.map((r) => ({
    id: r.gc_id,
    status: r.status,
    scheme: r.scheme,
    reference: r.reference,
    created_at: r.created_at_gc,
    next_possible_charge_date: r.next_possible_charge_date,
    customer_id: r.customer_id,
    customer_name: r.customer_name ?? "—",
    customer_email: r.customer_email,
    mitarbeiter: r.mitarbeiter,
    deal_id: r.deal_id,
  }));

  return NextResponse.json({
    env,
    count: count ?? mandates.length,
    synced_at: synced,
    mandates,
  });
}
