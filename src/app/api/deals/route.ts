import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeAllDeals } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeAllDeals(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const paymentStatus = url.searchParams.get("payment_status");
  const intervall = url.searchParams.get("intervall");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "1000", 10) || 1000, 5000);

  let q = supabaseAdmin()
    .from("deals")
    .select(
      "id,vorname,nachname,email,betrag,betrag_original,start_datum,anzahl_raten,intervall,payment_status,paid_at,amount_paid,hubspot_deal_id,mitarbeiter_name",
    )
    .eq("is_shadow", false)
    .eq("pending_delete", false)
    .limit(limit);
  if (paymentStatus) q = q.eq("payment_status", paymentStatus);
  if (intervall) q = q.eq("intervall", intervall);
  q = q.order("start_datum", { ascending: false, nullsFirst: false });
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deals: data ?? [] });
}
