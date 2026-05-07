import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getEmployeeByEmail,
  insertHubspotDealIfMissing,
  listEmployees,
  upsertDealByHubspotId,
} from "@/lib/store";
import {
  CLOSED_WON_STAGE_ID,
  NEUKUNDEN_PIPELINE_ID,
} from "@/lib/hubspot-sync";
import type { Employee } from "@/lib/types";

const HUBSPOT_BASE = "https://api.hubapi.com";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

interface LegacyPayload {
  hubspot_deal_id: string;
  vorname: string;
  nachname: string;
  email?: string | null;
  betrag: number;
  owner_id?: string;
  owner_email?: string;
}

interface HubspotEventV3 {
  subscriptionType?: string;
  objectId?: number | string;
  propertyName?: string;
  propertyValue?: string;
}

interface HubspotDealApi {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    hubspot_owner_id?: string;
    pipeline?: string;
    dealstage?: string;
    closedate?: string;
  };
}

function isLegacyPayload(x: unknown): x is LegacyPayload {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as Record<string, unknown>).hubspot_deal_id === "string" &&
    typeof (x as Record<string, unknown>).vorname === "string" &&
    (x as Record<string, unknown>).betrag !== undefined
  );
}

function splitName(dealname: string): { vorname: string; nachname: string } {
  const cleaned = dealname.includes("|")
    ? (dealname.split("|").pop() ?? "").trim()
    : dealname.trim();
  if (!cleaned) return { vorname: "", nachname: "" };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { vorname: parts[0], nachname: "" };
  return { vorname: parts[0], nachname: parts.slice(1).join(" ") };
}

/**
 * Extrahiert Deal-IDs aus den verschiedenen HubSpot-Webhook-Payloads:
 * - HubSpot Webhooks-API v3 event array (subscriptionType: deal.*)
 * - HubSpot Workflow „Send Webhook" mit Standard-Body (hs_object_id)
 * - Workflow mit Custom-JSON, das `objectId` / `dealId` setzt
 */
function extractDealIds(body: unknown): string[] {
  const ids = new Set<string>();
  function add(v: unknown) {
    if (v == null) return;
    const s = String(v).trim();
    if (s) ids.add(s);
  }
  if (Array.isArray(body)) {
    for (const item of body) {
      if (typeof item === "object" && item !== null) {
        const ev = item as HubspotEventV3 & Record<string, unknown>;
        add(ev.objectId);
        add(ev.dealId);
        add((ev as Record<string, unknown>).hs_object_id);
      }
    }
  } else if (typeof body === "object" && body !== null) {
    const obj = body as Record<string, unknown>;
    add(obj.hubspot_deal_id);
    add(obj.hs_object_id);
    add(obj.objectId);
    add(obj.dealId);
    if (typeof obj.properties === "object" && obj.properties) {
      const p = obj.properties as Record<string, unknown>;
      add(p.hs_object_id);
    }
  }
  return Array.from(ids);
}

async function fetchDeal(token: string, dealId: string): Promise<HubspotDealApi | null> {
  const url = new URL(`${HUBSPOT_BASE}/crm/v3/objects/deals/${dealId}`);
  url.searchParams.set(
    "properties",
    "dealname,amount,hubspot_owner_id,pipeline,dealstage,closedate",
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HubSpot deal ${dealId} ${res.status}`);
  }
  return (await res.json()) as HubspotDealApi;
}

async function resolveOwner(
  employees: Employee[],
  ownerId: string | undefined,
  ownerEmail?: string | null,
): Promise<{ mitarbeiter_id: string; mitarbeiter_name: string }> {
  let mitarbeiter_id = ownerId ?? "";
  let mitarbeiter_name = "";
  const matchedByOwnerId = ownerId
    ? employees.find((e) => e.hubspot_owner_id === ownerId)
    : null;
  const matchedByEmail = ownerEmail
    ? await getEmployeeByEmail(ownerEmail)
    : null;
  const matched = matchedByOwnerId ?? matchedByEmail;
  if (matched) {
    mitarbeiter_id = matched.hubspot_owner_id ?? matched.id;
    mitarbeiter_name = matched.name;
  } else {
    mitarbeiter_name = ownerEmail ?? `Owner ${ownerId ?? "?"}`;
  }
  return { mitarbeiter_id, mitarbeiter_name };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Secret kann auf 3 Arten kommen — HubSpot Workflows können keinen
  // Custom-Header senden, daher zusätzlich als Body-Feld oder URL-Param:
  // 1. Header `x-webhook-secret`
  // 2. URL-Param `?s=...`
  // 3. Body-Feld `webhook_secret`
  const expected = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (expected) {
    const fromHeader = req.headers.get("x-webhook-secret");
    const fromQuery = new URL(req.url).searchParams.get("s");
    const fromBody =
      typeof body === "object" && body !== null
        ? ((body as Record<string, unknown>).webhook_secret as
            | string
            | undefined)
        : undefined;
    const got = fromHeader || fromQuery || fromBody;
    if (got !== expected) return unauthorized();
  }

  const employees = await listEmployees();
  const results: Array<Record<string, unknown>> = [];

  // 1) Altes Custom-JSON-Format (Backward-compat) — wenn Felder direkt mitgesendet werden,
  // sparen wir uns den HubSpot-API-Roundtrip.
  const legacyItems = Array.isArray(body)
    ? (body.filter(isLegacyPayload) as LegacyPayload[])
    : isLegacyPayload(body)
      ? [body]
      : [];

  for (const item of legacyItems) {
    const owner = await resolveOwner(
      employees,
      item.owner_id,
      item.owner_email,
    );
    const deal = await upsertDealByHubspotId(item.hubspot_deal_id, {
      vorname: item.vorname,
      nachname: item.nachname,
      email: item.email ?? null,
      mitarbeiter_id: owner.mitarbeiter_id,
      mitarbeiter_name: owner.mitarbeiter_name,
      betrag: Number(item.betrag),
      start_datum: null,
      anzahl_raten: null,
      intervall: null,
    });
    results.push({ legacy: true, id: deal.id, hubspot_deal_id: deal.hubspot_deal_id });
  }

  // 2) HubSpot-natives Format: nur Deal-IDs vorhanden — restliche Felder per
  // HubSpot CRM API laden, dann (insert-only) anlegen.
  if (legacyItems.length === 0) {
    const dealIds = extractDealIds(body);
    if (dealIds.length === 0) {
      return NextResponse.json(
        { error: "no_deal_id_found", body_preview: typeof body },
        { status: 400 },
      );
    }
    const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "HUBSPOT_PRIVATE_APP_TOKEN not set" },
        { status: 500 },
      );
    }

    for (const dealId of dealIds) {
      try {
        const deal = await fetchDeal(token, dealId);
        if (!deal) {
          results.push({ skipped: true, reason: "not_found", dealId });
          continue;
        }
        // Filter: nur Won-Deals der Neukunden-Pipeline kommen ins Dashboard.
        if (
          deal.properties.pipeline !== NEUKUNDEN_PIPELINE_ID ||
          deal.properties.dealstage !== CLOSED_WON_STAGE_ID
        ) {
          results.push({
            skipped: true,
            reason: "wrong_pipeline_or_stage",
            dealId,
            pipeline: deal.properties.pipeline,
            stage: deal.properties.dealstage,
          });
          continue;
        }
        const ownerId = deal.properties.hubspot_owner_id;
        const owner = await resolveOwner(employees, ownerId);
        const { vorname, nachname } = splitName(deal.properties.dealname ?? "");
        const close = deal.properties.closedate ?? null;
        const default_start_datum = close ? close.slice(0, 10) : null;
        const result = await insertHubspotDealIfMissing(dealId, {
          vorname,
          nachname,
          email: null,
          mitarbeiter_id: owner.mitarbeiter_id,
          mitarbeiter_name: owner.mitarbeiter_name,
          betrag: Number(deal.properties.amount ?? 0),
          default_start_datum,
        });
        results.push({
          id: result.deal.id,
          hubspot_deal_id: dealId,
          created: result.created,
        });
      } catch (err) {
        results.push({
          error: err instanceof Error ? err.message : String(err),
          dealId,
        });
      }
    }
  }

  revalidatePath("/daten");
  revalidatePath("/");
  return NextResponse.json({ ok: true, results });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST endpoint accepts: HubSpot v3 webhook events, HubSpot Workflow standard payloads (with hs_object_id), and the legacy custom JSON. Set HUBSPOT_WEBHOOK_SECRET to require x-webhook-secret header.",
  });
}
