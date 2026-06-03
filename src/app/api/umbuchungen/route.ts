/**
 * GET /cashflow/api/umbuchungen?q=&include_reverted=
 * Proxy zu /api/admin/umbuchungen am Bot.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeCustomerHappiness(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  const url = new URL(req.url);
  const params = new URLSearchParams();
  const q = url.searchParams.get("q");
  if (q) params.set("q", q);
  if (url.searchParams.get("include_reverted") === "1")
    params.set("include_reverted", "1");
  const limit = url.searchParams.get("limit");
  if (limit) params.set("limit", limit);
  const qs = params.toString();
  const target =
    `${BOT_URL.replace(/\/+$/, "")}/api/admin/umbuchungen` +
    (qs ? `?${qs}` : "");
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
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
