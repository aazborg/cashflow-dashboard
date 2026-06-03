/**
 * POST /cashflow/api/zertifikate/bulk-update
 * Body: { ids: [uuid, ...], action: 'erledigt' | 'wieder_offen' }
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeCustomerHappiness(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  let body: { ids?: string[]; action?: string } = {};
  try {
    body = await req.json();
  } catch {}
  if (!Array.isArray(body.ids) || body.ids.length === 0)
    return NextResponse.json({ error: "ids erforderlich" }, { status: 400 });
  if (body.action !== "erledigt" && body.action !== "wieder_offen")
    return NextResponse.json({ error: "action ungueltig" }, { status: 400 });
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/zertifikate/bulk-update`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: body.ids,
        action: body.action,
        by: ctx.user.email,
      }),
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
