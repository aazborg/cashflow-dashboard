/**
 * Notiz-Vorlagen CRUD-Endpoints (Supabase).
 *
 *   GET  /cashflow/api/notiz-vorlagen?email=...  -> Liste fuer Email
 *   POST /cashflow/api/notiz-vorlagen            -> neue Vorlage speichern
 *
 * Permission: dieselbe Whitelist wie der Rechnungs-Bot
 * (canUseRechnungsBot -- Beta, nur Mario via env).
 *
 * RLS: Tabelle ist gegen direkten Client-Zugriff gesperrt; nur
 * supabaseAdmin (Service-Role) liest/schreibt hier.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { canUseRechnungsBot } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function authorized(): Promise<
  | { ctx: NonNullable<Awaited<ReturnType<typeof getSessionContext>>> }
  | { error: NextResponse }
> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return {
      error: NextResponse.json({ error: "not authenticated" }, { status: 401 }),
    };
  }
  if (!canUseRechnungsBot(ctx)) {
    return {
      error: NextResponse.json(
        { error: "forbidden — Beta nur fuer ausgewaehlte Admins" },
        { status: 403 },
      ),
    };
  }
  return { ctx };
}

export async function GET(req: NextRequest) {
  const auth = await authorized();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") || "10", 10) || 10),
  );

  const sb = supabaseAdmin();
  let q = sb
    .from("notiz_vorlagen")
    .select(
      "id, email, name, hauptprodukt, rechnungstitel, notiz_text, "
        + "rechnung_id, rechnung_created_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (email) {
    q = q.ilike("email", email);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }
  return NextResponse.json({ count: data?.length ?? 0, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorized();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "ungueltiges JSON" }, { status: 400 });
  }

  const email = String(body.email || "").trim();
  if (!email) {
    return NextResponse.json(
      { error: "email ist erforderlich" },
      { status: 400 },
    );
  }
  const positionen = body.positionen;
  if (!Array.isArray(positionen)) {
    return NextResponse.json(
      { error: "positionen muss ein Array sein" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notiz_vorlagen")
    .insert({
      email: email,
      name: body.name ? String(body.name).trim() : null,
      hauptprodukt: body.hauptprodukt
        ? String(body.hauptprodukt).trim()
        : null,
      rechnungstitel: body.rechnungstitel
        ? String(body.rechnungstitel).trim()
        : null,
      positionen: positionen,
      notiz_text: body.notiz_text ? String(body.notiz_text) : null,
      created_by_email: auth.ctx.user.email,
    })
    .select("id, created_at")
    .single();
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, ...data });
}
