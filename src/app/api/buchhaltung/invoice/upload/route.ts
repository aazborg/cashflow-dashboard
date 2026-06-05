import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

async function guard() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canManagePayments(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  return { ctx };
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g instanceof NextResponse) return g;
  const fd = await req.formData();
  fd.append("by_email", g.ctx.user.email);
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/buchhaltung/invoice/upload`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
      body: fd as unknown as BodyInit,
      cache: "no-store",
    });
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
