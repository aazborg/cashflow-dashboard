/**
 * POST /cashflow/api/zertifikate/bulk-pdf
 * Body: { ids }
 * Returnt: application/pdf Stream
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canSeeCustomerHappiness(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  let body: { ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {}
  if (!Array.isArray(body.ids) || body.ids.length === 0)
    return NextResponse.json({ error: "ids erforderlich" }, { status: 400 });
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/zertifikate/bulk-pdf`;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: body.ids }),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Bot nicht erreichbar", detail: String(err) },
      { status: 502 },
    );
  }
  if (res.status !== 200) {
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return new NextResponse(text, { status: res.status });
    }
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=zertifikate.pdf",
      "X-Pages": res.headers.get("x-pages") ?? "",
      "X-Skipped": res.headers.get("x-skipped") ?? "",
    },
  });
}
