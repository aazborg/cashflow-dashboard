/**
 * Seminar-Anmeldungen einer Person (live aus SimplyOrg).
 *
 *   GET /cashflow/api/contacts/<person_id>/events
 *   GET /cashflow/api/contacts/<person_id>/events?include_trainer=1
 *
 * Proxy zum Bot-Endpoint /api/admin/contacts/<id>/events. Live-Call
 * weil sich Anmeldungen oft aendern. Auth: Customer-Happiness.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

interface RouteContext {
  params: Promise<{ person_id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
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
      { error: "BOT_API_TOKEN nicht in env konfiguriert" },
      { status: 500 },
    );
  }
  const { person_id } = await context.params;
  const pid = Number.parseInt(person_id, 10);
  if (!pid || pid <= 0) {
    return NextResponse.json(
      { error: "person_id (positive Integer) erforderlich" },
      { status: 400 },
    );
  }
  const url = new URL(req.url);
  const includeTrainer = url.searchParams.get("include_trainer") === "1";
  const target =
    `${BOT_URL.replace(/\/+$/, "")}/api/admin/contacts/${pid}/events` +
    (includeTrainer ? "?include_trainer=1" : "");
  let res: Response;
  try {
    res = await fetch(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
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
