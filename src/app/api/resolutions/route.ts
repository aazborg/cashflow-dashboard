/**
 * POST /api/resolutions
 *   Body: { gc_id, kind: 'payment'|'mandate', done: boolean, note?: string }
 *   done=true  -> upsert -> 'erledigt' markieren
 *   done=false -> delete -> Marker entfernen
 *
 * Permission: gleiche Regel wie der Mahn-Workflow (canManagePayments
 * = Admin + Accounting). Sales sehen die Faelle nicht aktiv bearbeiten.
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
    gc_id?: unknown;
    kind?: unknown;
    done?: unknown;
    note?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const gc_id = typeof body.gc_id === "string" ? body.gc_id.trim() : "";
  const kind = body.kind === "mandate" ? "mandate" : "payment";
  const done = !!body.done;
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
  if (!gc_id || !/^[A-Z]{2,3}\d{2,}[A-Z0-9]{6,}$/.test(gc_id)) {
    return NextResponse.json({ error: "invalid gc_id" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!done) {
    const { error } = await sb
      .from("gocardless_resolutions")
      .delete()
      .eq("gc_id", gc_id)
      .eq("kind", kind);
    if (error) {
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, done: false });
  }

  const { error } = await sb.from("gocardless_resolutions").upsert(
    {
      gc_id,
      kind,
      done_by_email: ctx.user.email,
      note,
      done_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "gc_id,kind" },
  );
  if (error) {
    return NextResponse.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    done: true,
    done_by_email: ctx.user.email,
  });
}
