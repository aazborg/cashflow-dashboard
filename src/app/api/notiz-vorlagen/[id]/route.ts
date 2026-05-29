/**
 * Detail-Endpoints fuer eine einzelne Notiz-Vorlage.
 *
 *   GET    /cashflow/api/notiz-vorlagen/<id>   -> volle Vorlage inkl. positionen
 *   DELETE /cashflow/api/notiz-vorlagen/<id>   -> Vorlage entfernen
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { canUseRechnungsBot } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

async function authorized(): Promise<NextResponse | null> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!canUseRechnungsBot(ctx)) {
    return NextResponse.json(
      { error: "forbidden — Beta nur fuer ausgewaehlte Admins" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: Context) {
  const err = await authorized();
  if (err) return err;
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notiz_vorlagen")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json(data);
}

/**
 * PATCH: partielle Update -- erlaubt nur Felder die der
 * Rechnungs-Workflow setzen darf:
 *   rechnung_id, rechnung_status ('draft'|'sent'|null),
 *   rechnung_created_at.
 */
export async function PATCH(req: NextRequest, ctx: Context) {
  const err = await authorized();
  if (err) return err;
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON ungueltig" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if ("rechnung_id" in body) {
    const v = body.rechnung_id;
    patch.rechnung_id =
      v == null ? null : Number(v);
  }
  if ("rechnung_status" in body) {
    const v = body.rechnung_status as string | null;
    if (v != null && !["draft", "sent", "cancelled"].includes(v)) {
      return NextResponse.json(
        { error: "rechnung_status muss 'draft', 'sent' oder 'cancelled' sein" },
        { status: 400 },
      );
    }
    patch.rechnung_status = v;
  }
  if ("rechnung_created_at" in body) {
    patch.rechnung_created_at = body.rechnung_created_at as string | null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "keine erlaubten Felder im Body" },
      { status: 400 },
    );
  }
  patch.updated_at = new Date().toISOString();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notiz_vorlagen")
    .update(patch)
    .eq("id", id)
    .select("id, rechnung_id, rechnung_status, rechnung_created_at, updated_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_req: NextRequest, ctx: Context) {
  const err = await authorized();
  if (err) return err;
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from("notiz_vorlagen").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
