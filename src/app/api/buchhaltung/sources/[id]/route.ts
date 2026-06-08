/**
 * PATCH  /cashflow/api/buchhaltung/sources/<id>  -> Update
 * DELETE /cashflow/api/buchhaltung/sources/<id>  -> Delete
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

async function forward(req: NextRequest, ctx: RouteContext, method: "PATCH" | "DELETE"): Promise<NextResponse> {
  const e = await guard();
  if (e) return e;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "ungültige id" }, { status: 400 });
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/buchhaltung/sources/${id}`;
  let body: string | undefined;
  if (method === "PATCH") {
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

export function PATCH(req: NextRequest, ctx: RouteContext) { return forward(req, ctx, "PATCH"); }
export function DELETE(req: NextRequest, ctx: RouteContext) { return forward(req, ctx, "DELETE"); }
