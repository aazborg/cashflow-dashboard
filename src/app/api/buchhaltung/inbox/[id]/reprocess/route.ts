import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";
// Reprocess inkl. Claude-Parse + Drive-Upload kann bis zu ~60s dauern.
export const maxDuration = 90;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function guard() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canManagePayments(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  return null;
}

// Manueller "Erneut verarbeiten"-Trigger fuer eine Inbox-Mail.
// Body: { force?: boolean }   default true (umgeht self_sent / auto_reject)
export async function POST(req: NextRequest, context: RouteContext) {
  const e = await guard();
  if (e) return e;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "ungültige ID" }, { status: 400 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/buchhaltung/inbox/${id}/reprocess`;
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
