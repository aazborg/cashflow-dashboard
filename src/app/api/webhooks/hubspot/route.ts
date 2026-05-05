import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getEmployeeByEmail, listEmployees, upsertDealByHubspotId } from "@/lib/store";

interface HubspotPayload {
  hubspot_deal_id: string;
  vorname: string;
  nachname: string;
  email?: string | null;
  betrag: number;
  owner_id?: string;
  owner_email?: string;
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const expected = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers.get("x-webhook-secret");
    if (got !== expected) return unauthorized();
  }

  let body: HubspotPayload | HubspotPayload[];
  try {
    body = (await req.json()) as HubspotPayload | HubspotPayload[];
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : [body];
  const employees = await listEmployees();

  const results = [];
  for (const item of items) {
    if (!item.hubspot_deal_id || !item.vorname || !item.betrag) {
      results.push({ skipped: true, reason: "missing_fields", item });
      continue;
    }

    let mitarbeiter_id = item.owner_id ?? "";
    let mitarbeiter_name = "";
    const matchedByOwnerId = employees.find(
      (e) => e.hubspot_owner_id && e.hubspot_owner_id === item.owner_id,
    );
    const matchedByEmail = item.owner_email
      ? await getEmployeeByEmail(item.owner_email)
      : null;
    const matched = matchedByOwnerId ?? matchedByEmail;
    if (matched) {
      mitarbeiter_id = matched.hubspot_owner_id ?? matched.id;
      mitarbeiter_name = matched.name;
    } else {
      mitarbeiter_name = item.owner_email ?? `Owner ${item.owner_id ?? "?"}`;
    }

    const deal = await upsertDealByHubspotId(item.hubspot_deal_id, {
      vorname: item.vorname,
      nachname: item.nachname,
      email: item.email ?? null,
      mitarbeiter_id,
      mitarbeiter_name,
      betrag: Number(item.betrag),
      start_datum: null,
      anzahl_raten: null,
      intervall: null,
    });
    results.push({ id: deal.id, hubspot_deal_id: deal.hubspot_deal_id });
  }

  revalidatePath("/daten");
  revalidatePath("/");
  return NextResponse.json({ ok: true, results });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST a HubspotPayload here. Set HUBSPOT_WEBHOOK_SECRET to require x-webhook-secret header.",
  });
}
