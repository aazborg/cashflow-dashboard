import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { syncHubspotWonDeals } from "@/lib/hubspot-sync";
import { getSessionContext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return false;
}

async function runSync() {
  const summary = await syncHubspotWonDeals();
  revalidatePath("/daten");
  revalidatePath("/");
  return summary;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    const ctx = await getSessionContext();
    if (!ctx?.isAdmin) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const summary = await runSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// Vercel Cron sends GET with Authorization: Bearer $CRON_SECRET.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
