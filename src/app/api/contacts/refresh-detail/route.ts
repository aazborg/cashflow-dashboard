/**
 * Lazy-Detail-Fetch fuer einen einzelnen Kontakt.
 *
 *   POST /cashflow/api/contacts/refresh-detail
 *   Body: { "person_id": 1234 }
 *
 * Ruft den Bot-Endpoint /api/admin/contacts/refresh-detail auf, der
 * via Playwright /de/address/get-address/<person_id> abholt und das
 * Supabase-Cache-Row aktualisiert.
 *
 * Auth: jede:r eingeloggte:r User (Teilnehmer-Management).
 * Der BOT_API_TOKEN bleibt server-side.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

export async function POST(req: NextRequest) {
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
  if (!BOT_TOKEN) {
    return NextResponse.json(
      {
        error: "BOT_API_TOKEN nicht in env konfiguriert",
        hint: "Vercel-Project-Settings -> Environment Variables",
      },
      { status: 500 },
    );
  }

  let body: { person_id?: number | string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ungueltiges JSON" }, { status: 400 });
  }
  const pid = Number.parseInt(String(body.person_id ?? ""), 10);
  if (!pid || pid <= 0) {
    return NextResponse.json(
      { error: "person_id (positive Integer) erforderlich" },
      { status: 400 },
    );
  }

  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/contacts/refresh-detail`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ person_id: pid }),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Bot nicht erreichbar",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "text/plain",
      },
    });
  }
}
