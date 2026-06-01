/**
 * POST /api/resolutions
 *   Body: {
 *     gc_id,
 *     kind: 'payment'|'mandate',
 *     done?: boolean,
 *     dunning_status?: 'mahnung_1'|'mahnung_2'|'inkasso'|'resolved'|null,
 *     note?: string,
 *   }
 *
 * Verwendung:
 *   - done=true / done=false  -> Erledigt-Marker setzen/loeschen
 *   - dunning_status=...      -> Per-Payment Mahn-Status setzen
 *   - dunning_status=null     -> Per-Payment Mahn-Status loeschen
 *
 * Beide Felder koennen unabhaengig oder gemeinsam gesetzt werden.
 * Die Zeile wird geloescht wenn AM ENDE weder done_at noch
 * dunning_status gesetzt ist (Cleanup).
 *
 * Permission: canManagePayments (Admin + Accounting).
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const DUNNING = new Set(["mahnung_1", "mahnung_2", "inkasso", "resolved"]);

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
    dunning_status?: unknown;
    note?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const gc_id = typeof body.gc_id === "string" ? body.gc_id.trim() : "";
  const kind = body.kind === "mandate" ? "mandate" : "payment";
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
  if (!gc_id || !/^[A-Z]{2,3}\d{2,}[A-Z0-9]{6,}$/.test(gc_id)) {
    return NextResponse.json({ error: "invalid gc_id" }, { status: 400 });
  }
  const hasDoneField = body.done !== undefined;
  const done = !!body.done;
  const hasDunningField = body.dunning_status !== undefined;
  const dunningRaw = body.dunning_status;
  const dunning_status =
    dunningRaw === null || dunningRaw === ""
      ? null
      : typeof dunningRaw === "string" && DUNNING.has(dunningRaw)
        ? (dunningRaw as
            | "mahnung_1"
            | "mahnung_2"
            | "inkasso"
            | "resolved")
        : "INVALID";
  if (dunning_status === "INVALID") {
    return NextResponse.json(
      { error: "dunning_status invalid" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  // Lade existierende Zeile (falls vorhanden)
  const { data: existingRow } = await sb
    .from("gocardless_resolutions")
    .select("done_at,done_by_email,dunning_status,note")
    .eq("gc_id", gc_id)
    .eq("kind", kind)
    .maybeSingle();

  // Berechne den naechsten Zustand: nur die Felder die der Caller
  // expliziert ueberschrieben hat, der Rest bleibt erhalten.
  const nextDoneAt = hasDoneField
    ? done
      ? new Date().toISOString()
      : null
    : (existingRow?.done_at ?? null);
  const nextDoneBy = hasDoneField
    ? done
      ? ctx.user.email
      : null
    : (existingRow?.done_by_email ?? null);
  const nextDunning = hasDunningField
    ? dunning_status
    : (existingRow?.dunning_status ?? null);
  const nextNote = hasDoneField || hasDunningField
    ? (note ?? existingRow?.note ?? null)
    : (existingRow?.note ?? null);

  // Wenn nichts mehr gesetzt -> Zeile loeschen (Cleanup)
  if (!nextDoneAt && !nextDunning) {
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
    return NextResponse.json({
      ok: true,
      done: false,
      dunning_status: null,
    });
  }

  const { error } = await sb.from("gocardless_resolutions").upsert(
    {
      gc_id,
      kind,
      done_at: nextDoneAt,
      done_by_email: nextDoneBy,
      dunning_status: nextDunning,
      note: nextNote,
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
    done: !!nextDoneAt,
    dunning_status: nextDunning,
  });
}
