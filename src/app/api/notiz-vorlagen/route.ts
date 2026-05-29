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
  // Suche nach Email (exakt) ODER nach Substring auf name + email (q).
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50,
    ),
  );

  const sb = supabaseAdmin();
  let query = sb
    .from("notiz_vorlagen")
    .select(
      "id, email, name, hauptprodukt, rechnungstitel, notiz_text, "
        + "rechnung_id, rechnung_status, rechnung_created_at, "
        + "zahlungsmodell, raten_info, "
        + "created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (email) {
    query = query.ilike("email", email);
  } else if (q) {
    // PostgREST: .or() mit ilike auf mehrere Spalten -- name oder email
    // muss den Suchstring enthalten. % als Wildcard.
    const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data, error } = await query;
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
  // Mario's Semantik: pro Kunden-Email gibt es genau EINE
  // Angebots-Notiz. Beim Speichern werden alle bestehenden
  // Eintraege fuer diese Email geloescht und durch den neuen
  // ersetzt -- damit der Rechnungs-Tab spaeter eindeutig die
  // aktuelle Notiz wiederfindet.
  const { error: delErr } = await sb
    .from("notiz_vorlagen")
    .delete()
    .ilike("email", email);
  if (delErr) {
    return NextResponse.json(
      { error: `cleanup failed: ${delErr.message}`, code: delErr.code },
      { status: 500 },
    );
  }
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
