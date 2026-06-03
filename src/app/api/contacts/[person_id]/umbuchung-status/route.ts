/**
 * LSB-Praxis-Umbuchungs-Pre-Check.
 *
 *   GET /cashflow/api/contacts/<pid>/umbuchung-status?old_event_name=...
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

interface RouteContext {
  params: Promise<{ person_id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeCustomerHappiness(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  const { person_id } = await context.params;
  const pid = Number.parseInt(person_id, 10);
  if (!pid) return NextResponse.json({ error: "ungueltige IDs" }, { status: 400 });
  const url = new URL(req.url);
  const params = new URLSearchParams();
  const oldName = url.searchParams.get("old_event_name");
  if (oldName) params.set("old_event_name", oldName);
  const qs = params.toString();
  const target =
    `${BOT_URL.replace(/\/+$/, "")}/api/admin/contacts/${pid}/umbuchung-status` +
    (qs ? `?${qs}` : "");
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Bot nicht erreichbar", detail: String(err) },
      { status: 502 },
    );
  }
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}
