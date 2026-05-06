import { listEmployees, upsertMonthlySnapshot } from "./store";
import {
  CLOSED_WON_STAGE_ID,
  NEUKUNDEN_PIPELINE_ID,
} from "./hubspot-sync";

const HUBSPOT_BASE = "https://api.hubapi.com";
const MEETING_TYPE = "Beratungsgespräch";
const STAGE_WON = CLOSED_WON_STAGE_ID;
const STAGE_WON_ENTERED_PROP = `hs_v2_date_entered_${STAGE_WON}`;

// Meeting outcomes that count as a "Quali" (booked Beratungsgespräch with a
// real outcome). SCHEDULED and empty are excluded — those are not yet
// resolved meetings.
const QUALI_OUTCOMES = new Set([
  "COMPLETED",
  "CANCELED",
  "NO_SHOW",
  "RESCHEDULED",
]);

interface HubspotMeeting {
  id: string;
  properties: {
    hs_meeting_outcome?: string;
    hs_timestamp?: string;
  };
}

interface HubspotDeal {
  id: string;
  properties: {
    amount?: string;
    hubspot_owner_id?: string;
    pipeline?: string;
    [key: string]: string | undefined;
  };
}

interface PagedResponse<T> {
  results: T[];
  paging?: { next?: { after: string } };
}

async function hsPost<T>(
  token: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `HubSpot ${path} ${res.status}: ${await res.text().catch(() => "")}`,
    );
  }
  return (await res.json()) as T;
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7); // "YYYY-MM"
}

function monthEdges(monthKey: string): { startMs: number; endMs: number } {
  const [y, m] = monthKey.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1, 0, 0, 0, 0);
  const end = Date.UTC(y, m, 1, 0, 0, 0, 0); // exclusive
  return { startMs: start, endMs: end };
}

function listMonthsFromTo(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split("-").map(Number);
  const [yEnd, mEnd] = toMonth.split("-").map(Number);
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

async function fetchAllMeetings(
  token: string,
  fromMs: number,
  toMs: number,
): Promise<HubspotMeeting[]> {
  const all: HubspotMeeting[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_timestamp", operator: "GTE", value: String(fromMs) },
            { propertyName: "hs_timestamp", operator: "LT", value: String(toMs) },
            { propertyName: "hs_activity_type", operator: "EQ", value: MEETING_TYPE },
          ],
        },
      ],
      properties: ["hs_meeting_outcome", "hs_timestamp"],
      sorts: [{ propertyName: "hs_timestamp", direction: "ASCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;
    const j = await hsPost<PagedResponse<HubspotMeeting>>(
      token,
      "/crm/v3/objects/meetings/search",
      body,
    );
    all.push(...j.results);
    after = j.paging?.next?.after;
  } while (after);
  return all;
}

async function fetchMeetingDealAssoc(
  token: string,
  meetingIds: string[],
): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  for (let i = 0; i < meetingIds.length; i += 100) {
    const chunk = meetingIds.slice(i, i + 100);
    const body = { inputs: chunk.map((id) => ({ id })) };
    const j = await hsPost<{
      results: { from: { id: string }; to: { id: string }[] }[];
    }>(token, "/crm/v3/associations/meetings/deals/batch/read", body);
    for (const r of j.results) {
      m.set(
        r.from.id,
        r.to.map((t) => t.id),
      );
    }
  }
  return m;
}

async function fetchDealsByIds(
  token: string,
  dealIds: string[],
): Promise<Map<string, HubspotDeal>> {
  const out = new Map<string, HubspotDeal>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    const body = {
      inputs: chunk.map((id) => ({ id })),
      properties: ["hubspot_owner_id", "pipeline"],
    };
    const j = await hsPost<{ results: HubspotDeal[] }>(
      token,
      "/crm/v3/objects/deals/batch/read",
      body,
    );
    for (const d of j.results) out.set(d.id, d);
  }
  return out;
}

async function fetchWonDealsInRange(
  token: string,
  fromMs: number,
  toMs: number,
): Promise<HubspotDeal[]> {
  const all: HubspotDeal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: NEUKUNDEN_PIPELINE_ID },
            { propertyName: "dealstage", operator: "EQ", value: STAGE_WON },
            { propertyName: STAGE_WON_ENTERED_PROP, operator: "GTE", value: String(fromMs) },
            { propertyName: STAGE_WON_ENTERED_PROP, operator: "LT", value: String(toMs) },
          ],
        },
      ],
      properties: ["amount", "hubspot_owner_id", STAGE_WON_ENTERED_PROP],
      sorts: [{ propertyName: STAGE_WON_ENTERED_PROP, direction: "ASCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;
    const j = await hsPost<PagedResponse<HubspotDeal>>(
      token,
      "/crm/v3/objects/deals/search",
      body,
    );
    all.push(...j.results);
    after = j.paging?.next?.after;
  } while (after);
  return all;
}

interface Bucket {
  qualis: number;
  showups: number;
  won: number;
  sumAmount: number;
}

export interface SnapshotsSyncSummary {
  from_month: string;
  to_month: string;
  meetings_total: number;
  won_total: number;
  snapshots_written: number;
  unmatched_owners: number;
  duration_ms: number;
}

export async function syncMonthlySnapshots(
  opts: { fromMonth: string; toMonth: string },
): Promise<SnapshotsSyncSummary> {
  const started = Date.now();
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_PRIVATE_APP_TOKEN ist nicht gesetzt.");
  }

  const months = listMonthsFromTo(opts.fromMonth, opts.toMonth);
  if (months.length === 0) {
    throw new Error("Leerer Monatsbereich.");
  }
  const fromMs = monthEdges(months[0]).startMs;
  const toMs = monthEdges(months[months.length - 1]).endMs;

  const employees = await listEmployees();
  const employeesByOwnerId = new Map(
    employees
      .filter((e) => e.hubspot_owner_id)
      .map((e) => [e.hubspot_owner_id as string, e] as const),
  );

  // 1. Meetings
  const meetings = await fetchAllMeetings(token, fromMs, toMs);

  // 2. Meeting → Deal associations
  const m2d = await fetchMeetingDealAssoc(
    token,
    meetings.map((m) => m.id),
  );

  // 3. Resolve deal-owner for all involved deals
  const involvedDealIds = Array.from(
    new Set(Array.from(m2d.values()).flat()),
  );
  const deals = await fetchDealsByIds(token, involvedDealIds);

  // 4. Won deals in range (Neukunden, Closed Won, by stage-entered date)
  const wonDeals = await fetchWonDealsInRange(token, fromMs, toMs);

  // 5. Aggregate per (owner, month)
  const buckets = new Map<string, Bucket>();
  function getBucket(owner: string, month: string): Bucket {
    const key = `${owner}|${month}`;
    let b = buckets.get(key);
    if (!b) {
      b = { qualis: 0, showups: 0, won: 0, sumAmount: 0 };
      buckets.set(key, b);
    }
    return b;
  }

  for (const m of meetings) {
    const ts = m.properties.hs_timestamp;
    const outcome = m.properties.hs_meeting_outcome;
    if (!ts || !outcome || !QUALI_OUTCOMES.has(outcome)) continue;
    const month = monthKeyFromIso(ts);
    if (!months.includes(month)) continue;
    const dealIds = m2d.get(m.id) ?? [];
    const owners = new Set<string>();
    for (const did of dealIds) {
      const d = deals.get(did);
      const oid = d?.properties.hubspot_owner_id;
      if (oid) owners.add(oid);
    }
    for (const owner of owners) {
      const b = getBucket(owner, month);
      b.qualis += 1;
      if (outcome === "COMPLETED") b.showups += 1;
    }
  }

  for (const d of wonDeals) {
    const ts = d.properties[STAGE_WON_ENTERED_PROP];
    const owner = d.properties.hubspot_owner_id;
    if (!ts || !owner) continue;
    const month = monthKeyFromIso(ts);
    if (!months.includes(month)) continue;
    const b = getBucket(owner, month);
    b.won += 1;
    b.sumAmount += Number(d.properties.amount ?? 0);
  }

  // 6. Persist as monthly_snapshots — only for owners we know.
  let unmatched = 0;
  let written = 0;
  for (const [key, b] of buckets) {
    const [owner, month] = key.split("|");
    const emp = employeesByOwnerId.get(owner);
    if (!emp) {
      unmatched++;
      continue;
    }
    const showupRate = b.qualis > 0 ? (b.showups / b.qualis) * 100 : 0;
    const closeRate = b.showups > 0 ? (b.won / b.showups) * 100 : 0;
    const avgContract = b.won > 0 ? b.sumAmount / b.won : null;
    await upsertMonthlySnapshot({
      mitarbeiter_id: emp.hubspot_owner_id ?? emp.id,
      month,
      qualis: b.qualis,
      showup_rate: showupRate,
      close_rate: closeRate,
      avg_contract: avgContract,
    });
    written++;
  }

  return {
    from_month: months[0],
    to_month: months[months.length - 1],
    meetings_total: meetings.length,
    won_total: wonDeals.length,
    snapshots_written: written,
    unmatched_owners: unmatched,
    duration_ms: Date.now() - started,
  };
}
