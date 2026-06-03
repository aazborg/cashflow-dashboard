/**
 * GET  /cashflow/api/zertifikate?q=
 * POST /cashflow/api/zertifikate/sync       (-> /admin/zertifikate/sync)
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

async function guard() {
  const ctx = await getSessionContext();
  if (!ctx)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeCustomerHappiness(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  return null;
}

export async function GET(req: NextRequest) {
  const err = await guard();
  if (err) return err;
  const url = new URL(req.url);
  const params = new URLSearchParams();
  const q = url.searchParams.get("q");
  if (q) params.set("q", q);
  const limit = url.searchParams.get("limit");
  if (limit) params.set("limit", limit);
  const qs = params.toString();
  const target =
    `${BOT_URL.replace(/\/+$/, "")}/api/admin/zertifikate` +
    (qs ? `?${qs}` : "");
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
      cache: "no-store",
    });
  } catch (er) {
    return NextResponse.json(
      { error: "Bot nicht erreichbar", detail: String(er) },
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

export async function POST() {
  const err = await guard();
  if (err) return err;
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/zertifikate/sync`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
      cache: "no-store",
    });
  } catch (er) {
    return NextResponse.json(
      { error: "Bot nicht erreichbar", detail: String(er) },
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
