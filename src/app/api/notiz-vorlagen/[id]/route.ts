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
