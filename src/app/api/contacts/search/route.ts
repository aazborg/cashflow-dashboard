/**
 * Kontakt-Suche im SimplyOrg-Cache (Teilnehmer-Management).
 *
 *   GET /cashflow/api/contacts/search?q=...&limit=50
 *
 * Auth: jede:r eingeloggte:r User (Teilnehmer-Management ist fuer alle
 * eingeloggten Rollen sichtbar; Permission kann spaeter eingeschraenkt
 * werden falls noetig).
 *
 * Sucht in der Tabelle public.simplyorg_contacts_cache nach
 * Name/Email/Telefon (ILIKE-Substring). Wenn q leer ist: liefert die
 * juengst aktualisierten 50 Eintraege (UI hat dann was zu zeigen).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!canSeeCustomerHappiness(ctx)) {
    return NextResponse.json(
      { error: "forbidden — Teilnehmer-Management nur fuer Customer-Happiness" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(
    200,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50,
    ),
  );

  const sb = supabaseAdmin();
  const selectCols =
    "person_id, vorname, nachname, vollname, email, " +
    "is_participant, is_trainer, " +
    "telefon, mobil, strasse, plz, ort, land, " +
    "adresse_status, adresse_geholt_am, " +
    "last_synced_at, detail_synced_at";

  let query = sb
    .from("simplyorg_contacts_cache")
    .select(selectCols)
    .order("last_synced_at", { ascending: false })
    .limit(limit);

  if (q) {
    const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;
    query = query.or(
      `vollname.ilike.${pattern},` +
        `email.ilike.${pattern},` +
        `nachname.ilike.${pattern},` +
        `vorname.ilike.${pattern},` +
        `telefon.ilike.${pattern},` +
        `mobil.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }
  return NextResponse.json({
    count: data?.length ?? 0,
    q,
    data: data ?? [],
  });
}
