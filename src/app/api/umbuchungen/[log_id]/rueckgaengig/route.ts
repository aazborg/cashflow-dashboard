/**
 * POST /cashflow/api/umbuchungen/<log_id>/rueckgaengig
 * Body: { reason }
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

interface RouteContext {
  params: Promise<{ log_id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeCustomerHappiness(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  const { log_id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(log_id))
    return NextResponse.json({ error: "log_id muss UUID sein" }, { status: 400 });
  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 5)
    return NextResponse.json(
      { error: "Grund (mind. 5 Zeichen) erforderlich" },
      { status: 400 },
    );
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/umbuchungen/${log_id}/rueckgaengig`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason, by: ctx.user.email }),
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
