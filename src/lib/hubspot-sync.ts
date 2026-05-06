import {
  insertHubspotDealIfMissing,
  listEmployees,
} from "./store";

const HUBSPOT_BASE = "https://api.hubapi.com";
export const NEUKUNDEN_PIPELINE_ID = "1591488724";
export const CLOSED_WON_STAGE_ID = "2174705850";

interface HubspotDealResult {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    closedate?: string;
    createdate?: string;
    hubspot_owner_id?: string;
    pipeline?: string;
    dealstage?: string;
  };
}

interface HubspotSearchResponse {
  total: number;
  results: HubspotDealResult[];
  paging?: { next?: { after: string } };
}

interface HubspotOwner {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

interface HubspotOwnersResponse {
  results: HubspotOwner[];
  paging?: { next?: { after: string } };
}

async function fetchOwners(token: string): Promise<Map<string, HubspotOwner>> {
  const owners = new Map<string, HubspotOwner>();
  let after: string | undefined;
  do {
    const url = new URL(`${HUBSPOT_BASE}/crm/v3/owners`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `HubSpot owners ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
    const json = (await res.json()) as HubspotOwnersResponse;
    for (const o of json.results) owners.set(o.id, o);
    after = json.paging?.next?.after;
  } while (after);
  return owners;
}

function splitName(dealname: string): {
  vorname: string;
  nachname: string;
} {
  // Handles "Vorname Nachname" and "Tag | Vorname Nachname".
  const cleaned = dealname.includes("|")
    ? (dealname.split("|").pop() ?? "").trim()
    : dealname.trim();
  if (!cleaned) return { vorname: "", nachname: "" };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { vorname: parts[0], nachname: "" };
  return { vorname: parts[0], nachname: parts.slice(1).join(" ") };
}

export interface SyncSummary {
  total: number;
  pages: number;
  created: number;
  skipped_existing: number;
  unmatched_owners: number;
  errors: { hubspot_deal_id: string; message: string }[];
  duration_ms: number;
}

export async function syncHubspotWonDeals(): Promise<SyncSummary> {
  const started = Date.now();
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_PRIVATE_APP_TOKEN ist nicht gesetzt.");
  }

  const [employees, owners] = await Promise.all([
    listEmployees(),
    fetchOwners(token),
  ]);
  const employeeByOwnerId = new Map(
    employees
      .filter((e) => e.hubspot_owner_id)
      .map((e) => [e.hubspot_owner_id as string, e] as const),
  );

  let after: string | undefined;
  let pages = 0;
  let total = 0;
  let created = 0;
  let skipped_existing = 0;
  let unmatched_owners = 0;
  const errors: SyncSummary["errors"] = [];

  do {
    const body = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "pipeline",
              operator: "EQ",
              value: NEUKUNDEN_PIPELINE_ID,
            },
            {
              propertyName: "dealstage",
              operator: "EQ",
              value: CLOSED_WON_STAGE_ID,
            },
          ],
        },
      ],
      properties: [
        "dealname",
        "amount",
        "closedate",
        "createdate",
        "hubspot_owner_id",
      ],
      sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      limit: 100,
      after,
    };
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `HubSpot search ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
    const json = (await res.json()) as HubspotSearchResponse;
    pages++;
    total = json.total;

    for (const item of json.results) {
      try {
        const ownerId = item.properties.hubspot_owner_id ?? "";
        const matchedEmp = ownerId ? employeeByOwnerId.get(ownerId) : null;
        const owner = ownerId ? owners.get(ownerId) : null;
        let mitarbeiter_id = ownerId;
        let mitarbeiter_name = "";
        if (matchedEmp) {
          mitarbeiter_id = matchedEmp.hubspot_owner_id ?? matchedEmp.id;
          mitarbeiter_name = matchedEmp.name;
        } else if (owner) {
          mitarbeiter_name =
            [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() ||
            owner.email ||
            `Owner ${ownerId}`;
          unmatched_owners++;
        } else {
          mitarbeiter_name = `Owner ${ownerId || "?"}`;
          unmatched_owners++;
        }

        const { vorname, nachname } = splitName(
          item.properties.dealname ?? "",
        );
        const betrag = Number(item.properties.amount ?? 0);
        const close = item.properties.closedate ?? null;
        const default_start_datum = close ? close.slice(0, 10) : null;

        const result = await insertHubspotDealIfMissing(item.id, {
          vorname,
          nachname,
          email: null,
          mitarbeiter_id,
          mitarbeiter_name,
          betrag: Number.isFinite(betrag) ? betrag : 0,
          default_start_datum,
        });
        if (result.created) created++;
        else skipped_existing++;
      } catch (err) {
        errors.push({
          hubspot_deal_id: item.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    after = json.paging?.next?.after;
  } while (after);

  return {
    total,
    pages,
    created,
    skipped_existing,
    unmatched_owners,
    errors,
    duration_ms: Date.now() - started,
  };
}
