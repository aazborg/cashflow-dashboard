import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeSeminarmanagement } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

interface RouteContext {
  params: Promise<{ lid: string }>;
}

async function guard() {
  const ctx = await getSessionContext();
  if (!ctx)
    return { err: NextResponse.json({ error: "not authenticated" }, { status: 401 }), ctx: null };
  if (!canSeeSeminarmanagement(ctx))
    return { err: NextResponse.json({ error: "forbidden" }, { status: 403 }), ctx };
  if (!BOT_TOKEN)
    return { err: NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 }), ctx };
  return { err: null, ctx };
}

async function forward(method: "PATCH" | "DELETE", lid: string, body: Record<string, unknown> | null) {
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/seminarmanagement/lieferanten/${lid}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${BOT_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  };
  if (body) init.body = JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(target, init);
  } catch (err) {
    return NextResponse.json({ error: "Bot nicht erreichbar", detail: String(err) }, { status: 502 });
  }
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const g = await guard();
  if (g.err) return g.err;
  const { lid } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(lid))
    return NextResponse.json({ error: "lid invalid" }, { status: 400 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}
  return forward("PATCH", lid, body);
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const g = await guard();
  if (g.err) return g.err;
  const { lid } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(lid))
    return NextResponse.json({ error: "lid invalid" }, { status: 400 });
  return forward("DELETE", lid, null);
}
