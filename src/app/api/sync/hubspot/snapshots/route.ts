import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { syncMonthlySnapshots } from "@/lib/hubspot-snapshots-sync";
import { getSessionContext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_FROM_MONTH = "2026-01";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return false;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function runSync(fromMonth?: string, toMonth?: string) {
  const summary = await syncMonthlySnapshots({
    fromMonth: fromMonth ?? DEFAULT_FROM_MONTH,
    toMonth: toMonth ?? currentMonth(),
  });
  revalidatePath("/");
  revalidatePath("/rechner");
  revalidatePath("/ziele");
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
    const url = new URL(req.url);
    const fromMonth = url.searchParams.get("from") ?? undefined;
    const toMonth = url.searchParams.get("to") ?? undefined;
    const summary = await runSync(fromMonth, toMonth);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
