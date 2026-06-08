/**
 * POST /cashflow/api/buchhaltung/sources/<id>/sync
 * Body: { year, month }
 * Triggert einen Sync-Lauf fuer die angegebene Quelle.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";
// Sync kann Playwright-Login + Download mehrerer PDFs = bis zu 2 Min.
export const maxDuration = 300;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canManagePayments(session))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "ungültige id" }, { status: 400 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  body.triggered_by_email = session.user.email;
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/buchhaltung/sources/${id}/sync`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json({ error: "Bot nicht erreichbar", detail: String(err) }, { status: 502 });
  }
  const raw = await res.text();
  try {
    return NextResponse.json(JSON.parse(raw), { status: res.status });
  } catch {
    return new NextResponse(raw, { status: res.status });
  }
}
