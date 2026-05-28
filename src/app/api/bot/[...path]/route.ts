/**
 * Server-side Proxy zum Rechnungs-Bot (Mac Mini via Cloudflare Tunnel).
 *
 * Browser-Calls gehen an /api/bot/<pfad>, der Server fügt den
 * BOT_API_TOKEN aus env hinzu und ruft https://bot.aazb.org/<pfad>
 * auf. So bleibt der Token nie im Browser.
 *
 * Permission: nur User die canUseRechnungsBot erfüllen (Mario only
 * bis Stabilität bewiesen). Liste in env RECHNUNG_BOT_ALLOWED_EMAILS.
 *
 * Erforderliche env-Variablen (auf Vercel hinterlegen):
 *   - BOT_API_URL    z.B. https://bot.aazb.org
 *   - BOT_API_TOKEN  Bearer-Token (gleicher Wert wie auf Mac Mini)
 *   - RECHNUNG_BOT_ALLOWED_EMAILS (optional, default mario@)
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/supabase-server";
import { canUseRechnungsBot } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_URL = process.env.BOT_API_URL ?? "http://localhost:8080";
const BOT_TOKEN = process.env.BOT_API_TOKEN ?? "";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function authorized(): Promise<NextResponse | null> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!canUseRechnungsBot(ctx)) {
    return NextResponse.json(
      {
        error: "forbidden",
        hint:
          "Rechnungs-Bot ist derzeit nur fuer ausgewaehlte Admins " +
          "freigeschaltet (Beta).",
      },
      { status: 403 },
    );
  }
  if (!BOT_TOKEN) {
    return NextResponse.json(
      {
        error: "BOT_API_TOKEN nicht in env konfiguriert",
        hint: "Vercel-Project-Settings -> Environment Variables",
      },
      { status: 500 },
    );
  }
  return null;
}

function buildTargetUrl(req: NextRequest, segments: string[]): string {
  const base = BOT_URL.replace(/\/+$/, "");
  const path = segments.map((s) => encodeURIComponent(s)).join("/");
  const url = new URL(req.url);
  const query = url.search ? url.search : "";
  return `${base}/api/${path}${query}`;
}

async function proxy(
  req: NextRequest,
  method: "GET" | "POST",
  segments: string[],
): Promise<NextResponse> {
  const target = buildTargetUrl(req, segments);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${BOT_TOKEN}`,
  };
  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    try {
      const json = await req.json();
      body = JSON.stringify(json);
    } catch {
      body = "{}";
    }
  }
  let res: Response;
  try {
    res = await fetch(target, { method, headers, body, cache: "no-store" });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Bot nicht erreichbar",
        target,
        detail: err instanceof Error ? err.message : String(err),
        hint:
          "Pruefen ob Cloudflare-Tunnel laeuft und Bot-Server auf " +
          "Port 8080 hoert.",
      },
      { status: 502 },
    );
  }
  const text = await res.text();
  // Pass response through with same status and (assumed JSON) body
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
    });
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await authorized();
  if (auth) return auth;
  const { path } = await context.params;
  return proxy(req, "GET", path);
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await authorized();
  if (auth) return auth;
  const { path } = await context.params;
  return proxy(req, "POST", path);
}
