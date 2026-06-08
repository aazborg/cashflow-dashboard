/**
 * GET /cashflow/api/buchhaltung/sources/monatsabgleich?year=YYYY&month=M
 * Pro Quelle: Soll vs Ist (#Rechnungen im Monat).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!canManagePayments(ctx))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!BOT_TOKEN)
    return NextResponse.json({ error: "BOT_API_TOKEN missing" }, { status: 500 });
  const url = new URL(req.url);
  const target = `${BOT_URL.replace(/\/+$/, "")}/api/admin/buchhaltung/sources/monatsabgleich${url.search}`;
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { Authorization: `Bearer ${BOT_TOKEN}` },
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
