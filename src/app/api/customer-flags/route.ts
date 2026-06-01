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
    return NextResponse.json({ ok: true, status: null });
  }
  const { error } = await sb.from("gocardless_customer_flags").upsert(
    {
      gc_customer_id,
      status,
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
  return NextResponse.json({ ok: true, status });
}
