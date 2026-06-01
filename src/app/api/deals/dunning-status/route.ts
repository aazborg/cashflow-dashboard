/**
 * POST /api/deals/dunning-status
 * Body: { deal_id, dunning_status: null | 'mahnung_1' | 'mahnung_2' |
 *                                  'inkasso' | 'resolved' }
 *
 * SETZT NUR den Status -- triggert KEINE Email, KEINE GC-Gebuehr,
 * KEINE Slack-Pings. Zweck:
 *   - Manuelle Korrektur falsch gesetzter Status
 *   - Direkt 'Erledigt' setzen wenn Kunde anders gezahlt hat
 *   - Status nachpflegen wenn Mahnung ueber anderen Kanal raus ist
 *
 * Wer? Admin + Accounting (canManagePayments).
 *
 * Echte Mahnungen werden weiterhin ueber /api/bot/dunning/trigger
 * gesendet (mit Email + Gebuehren-Buchung) -- per Klick im Modal.
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "mahnung_1",
  "mahnung_2",
  "inkasso",
  "resolved",
]);

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!canManagePayments(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { deal_id?: unknown; dunning_status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const deal_id =
    typeof body.deal_id === "string" ? body.deal_id.trim() : "";
  const rawStatus = body.dunning_status;
  // null oder leere String => Mahnstatus loeschen
  const status =
    rawStatus === null ||
    rawStatus === undefined ||
    (typeof rawStatus === "string" && rawStatus === "")
      ? null
      : typeof rawStatus === "string" && ALLOWED.has(rawStatus)
        ? rawStatus
        : "INVALID";
  if (!deal_id) {
    return NextResponse.json({ error: "deal_id required" }, { status: 400 });
  }
  if (status === "INVALID") {
    return NextResponse.json(
      { error: "dunning_status invalid" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("deals")
    .update({
      dunning_status: status,
      dunning_updated_at: new Date().toISOString(),
    })
    .eq("id", deal_id);
  if (error) {
    return NextResponse.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, deal_id, dunning_status: status });
}
