/**
 * GET  /cashflow/api/buchhaltung/sources           -> Liste
 * POST /cashflow/api/buchhaltung/sources           -> Neue Quelle
 *
 * Proxy zum Bot. Token bleibt server-side.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

async function guard() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canManagePayments(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  return null;
}

async function forward(req: NextRequest, method: "GET" | "POST"): Promise<NextResponse> {
  const e = await guard();
  if (e) return e;
  const url = new URL(req.url);
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/buchhaltung/sources${url.search}`;
  let body: string | undefined;
  if (method === "POST") {
    try { body = await req.text(); } catch { body = undefined; }
  }
  let res: Response;
  try {
    res = await fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
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

export function GET(req: NextRequest) { return forward(req, "GET"); }
export function POST(req: NextRequest) { return forward(req, "POST"); }
