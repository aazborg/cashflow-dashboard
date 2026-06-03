/**
 * Einbuchung einer Person in ein Seminar.
 *
 *   POST /cashflow/api/contacts/<pid>/buchung
 *   Body: { event_id: number, reason: string }
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

export async function POST(req: NextRequest, context: RouteContext) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeCustomerHappiness(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  const { person_id } = await context.params;
  const pid = Number.parseInt(person_id, 10);
  if (!pid) return NextResponse.json({ error: "ungueltige IDs" }, { status: 400 });

  let body: { event_id?: number | string; reason?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const eid = Number.parseInt(String(body.event_id ?? ""), 10);
  if (!eid)
    return NextResponse.json({ error: "event_id erforderlich" }, { status: 400 });
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 5) {
    return NextResponse.json(
      { error: "Grund (mind. 5 Zeichen) erforderlich" },
      { status: 400 },
    );
  }

  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/contacts/${pid}/buchung`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_id: eid, reason, by: ctx.user.email }),
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
