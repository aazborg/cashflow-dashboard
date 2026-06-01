/**
 * POST /api/customer-flags
 *   Body: { gc_customer_id, status: 'storniert' | null, note?: string }
 *   status='storniert' -> upsert -> "kein Mandat ist OK so"
 *   status=null        -> delete -> Markierung entfernen
 *
 * Permission: Admin + Accounting (canManagePayments).
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!canManagePayments(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: {
    gc_customer_id?: unknown;
    status?: unknown;
    reason?: unknown;
    note?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const gc_customer_id =
    typeof body.gc_customer_id === "string"
      ? body.gc_customer_id.trim()
      : "";
  const status =
    body.status === "storniert" ? "storniert" : null;
  const REASONS = new Set(["vertragsende", "ueberwiesen", "inkasso"]);
  const reason =
    typeof body.reason === "string" && REASONS.has(body.reason)
      ? body.reason
      : null;
  const note =
    typeof body.note === "string" ? body.note.slice(0, 500) : null;
  if (!gc_customer_id || !/^[A-Z]{2,3}\d{2,}[A-Z0-9]{6,}$/.test(gc_customer_id)) {
    return NextResponse.json({ error: "invalid gc_customer_id" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (status === null) {
    const { error } = await sb
      .from("gocardless_customer_flags")
      .delete()
      .eq("gc_customer_id", gc_customer_id);
    if (error) {
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, status: null, reason: null });
  }
  const { error } = await sb.from("gocardless_customer_flags").upsert(
    {
      gc_customer_id,
      status,
      reason,
      marked_by_email: ctx.user.email,
      note,
      marked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "gc_customer_id" },
  );
  if (error) {
    return NextResponse.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }

  // Bei reason='inkasso': dunning_status='inkasso' auf alle Deals
  // dieses Customers setzen. Damit erscheint der Kunde sofort im
  // Inkasso-Tab. Echte Inkasso-Email (an Ergo etc.) wird NICHT
  // automatisch ausgeloest -- die haengt am Slack-Button-Workflow.
  let dealsPatched = 0;
  if (reason === "inkasso") {
    const { data: deals, error: dErr } = await sb
      .from("deals")
      .select("id,dunning_status")
      .eq("gocardless_customer_id", gc_customer_id);
    if (dErr) {
      // nicht fatal -- Flag ist gesetzt, aber Cascade fehl
      console.warn("inkasso cascade deals select fail:", dErr.message);
    } else {
      const ids = (deals ?? [])
        .filter(
          (d) =>
            d.dunning_status !== "inkasso" &&
            d.dunning_status !== "resolved",
        )
        .map((d) => d.id);
      if (ids.length > 0) {
        const { error: pErr } = await sb
          .from("deals")
          .update({
            dunning_status: "inkasso",
            dunning_updated_at: new Date().toISOString(),
          })
          .in("id", ids);
        if (pErr) {
          console.warn("inkasso cascade deals patch fail:", pErr.message);
        } else {
          dealsPatched = ids.length;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    status,
    reason,
    deals_patched_to_inkasso: dealsPatched,
  });
}
