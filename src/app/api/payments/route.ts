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

interface ResolutionRow {
  gc_id: string;
  done_at: string | null;
  done_by_email: string | null;
  dunning_status: string | null;
  note: string | null;
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
  // Supabase PostgREST hat ein server-side Hard-Limit von 1000 Zeilen
  // pro Query (per default). Wir paginieren explizit, bis alle Zeilen
  // gelesen sind. Bei ~5500 Zeilen -> 6 parallele Requests, jeweils
  // ~50ms => Gesamtzeit <500ms.
  const PAGE = 1000;
  const cols =
    "gc_id,amount_cents,currency,status,charge_date,description," +
    "reference,created_at_gc,customer_id,customer_name," +
    "customer_email,mitarbeiter,deal_id,mandate_id," +
    "subscription_id,instalment_schedule_id,env,synced_at";

  // Erst Count holen, dann parallel paginieren
  const head = await sb
    .from("gocardless_payments_cache")
    .select(cols, { count: "exact", head: true });
  if (head.error) {
    return NextResponse.json(
      { error: `Supabase head: ${head.error.message}` },
      { status: 500 },
    );
  }
  const total = head.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const requests: Array<
    PromiseLike<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>
  > = [];
  for (let i = 0; i < pages; i++) {
    const from = i * PAGE;
    const to = from + PAGE - 1;
    requests.push(
      sb
        .from("gocardless_payments_cache")
        .select(cols)
        .order("charge_date", { ascending: false, nullsFirst: false })
        .order("gc_id", { ascending: true })
        .range(from, to),
    );
  }
  const results = await Promise.all(requests);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) {
    return NextResponse.json(
      { error: `Supabase page: ${firstErr.error.message}` },
      { status: 500 },
    );
  }
  const data = results.flatMap((r) => r.data ?? []);
  const count = total;

  // Resolutions (Erledigt-Marker) laden -- mit Paginierung, da sie
  // moeglicherweise auch >1000 Eintraege werden koennen.
  const resolutionsMap = new Map<string, ResolutionRow>();
  {
    let from = 0;
    for (let i = 0; i < 50; i++) {
      const r = await sb
        .from("gocardless_resolutions")
        .select("gc_id,done_at,done_by_email,dunning_status,note")
        .eq("kind", "payment")
        .range(from, from + 999);
      if (r.error) break;
      const rows = (r.data ?? []) as unknown as ResolutionRow[];
      for (const row of rows) resolutionsMap.set(row.gc_id, row);
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  // Auf das Format mappen das das Frontend vom Bot-Endpoint kennt.
  const rows = data as unknown as CacheRow[];
  const synced = rows.length > 0 ? rows[0].synced_at : null;
  const env = rows.length > 0 ? rows[0].env : "live";
  // Customer-Lage: hat der Customer eine ZUKUENFTIG GEPLANTE Zahlung?
  // (Mandat-Status reicht nicht: ein 'active' Mandat ohne geplante
  // Payments bedeutet ebenfalls 'kein Geld kommt rein'.)
  // Plus: customer_flag (storniert OK) aus customer-flags-Tabelle.
  const customerIds = Array.from(
    new Set(rows.map((r) => r.customer_id).filter(Boolean) as string[]),
  );
  const upcomingCustomers = new Set<string>();
  const customerFlags = new Map<
    string,
    { status: string; reason: string | null }
  >();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (customerIds.length > 0) {
    const CHUNK = 200;
    // Zukuenftige geplante Zahlungen pro Kunde
    for (let i = 0; i < customerIds.length; i += CHUNK) {
      const part = customerIds.slice(i, i + CHUNK);
      const r = await sb
        .from("gocardless_payments_cache")
        .select("customer_id")
        .in("status", [
          "pending_submission",
          "submitted",
          "scheduled",
          "pending_customer_approval",
        ])
        .gte("charge_date", today)
        .in("customer_id", part);
      for (const row of (r.data ?? []) as Array<{
        customer_id: string | null;
      }>) {
        if (row.customer_id) upcomingCustomers.add(row.customer_id);
      }
    }
    // Flags
    for (let i = 0; i < customerIds.length; i += CHUNK) {
      const part = customerIds.slice(i, i + CHUNK);
      const r = await sb
        .from("gocardless_customer_flags")
        .select("gc_customer_id,status,reason")
        .in("gc_customer_id", part);
      for (const row of (r.data ?? []) as Array<{
        gc_customer_id: string;
        status: string;
        reason: string | null;
      }>) {
        customerFlags.set(row.gc_customer_id, {
          status: row.status,
          reason: row.reason,
        });
      }
    }
  }

  const payments = rows.map((r) => {
    const res = resolutionsMap.get(r.gc_id);
    const hasUpcoming = r.customer_id
      ? upcomingCustomers.has(r.customer_id)
      : false;
    const flagEntry = r.customer_id
      ? customerFlags.get(r.customer_id)
      : undefined;
    const flag = flagEntry?.status ?? null;
    const flagReason = flagEntry?.reason ?? null;
    return {
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
      done_at: res?.done_at ?? null,
      done_by_email: res?.done_by_email ?? null,
      dunning_status: res?.dunning_status ?? null,
      // Echtes 'Geld kommt rein'-Signal: zukuenftige geplante
      // Zahlung existiert. Wenn alle scheduled Zahlungen gecancelled
      // sind, ist auch ein active mandate quasi tot fuer uns.
      customer_has_active_mandate: hasUpcoming,
      customer_flag: flag,
      customer_flag_reason: flagReason,
    };
  });

  return NextResponse.json({
    env,
    count: count ?? payments.length,
    synced_at: synced,
    payments,
  });
}
