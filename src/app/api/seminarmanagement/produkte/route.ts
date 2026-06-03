import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeSeminarmanagement } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

async function guard() {
  const ctx = await getSessionContext();
  if (!ctx)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeSeminarmanagement(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  return null;
}

export async function GET() {
  const e = await guard();
  if (e) return e;
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/seminarmanagement/produkte`;
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
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

export async function POST(req: NextRequest) {
  const e = await guard();
  if (e) return e;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/seminarmanagement/produkte`;
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
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}
