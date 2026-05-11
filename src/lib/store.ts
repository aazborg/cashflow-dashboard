import { supabaseAdmin } from "./supabase";
import type {
  Deal,
  DeleteRequest,
  Employee,
  Intervall,
  MonthlySnapshot,
  Product,
} from "./types";

// ── Deals ──────────────────────────────────────────────────────────────────

interface DealRow {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  mitarbeiter_id: string;
  mitarbeiter_name: string;
  betrag: number | string;
  start_datum: string | null;
  anzahl_raten: number | null;
  intervall: Intervall | null;
  hubspot_deal_id: string | null;
  source: "hubspot" | "manual" | "legacy";
  pending_delete: boolean;
  created_at: string;
}

function rowToDeal(r: DealRow): Deal {
  return {
    id: r.id,
    vorname: r.vorname,
    nachname: r.nachname,
    email: r.email,
    mitarbeiter_id: r.mitarbeiter_id,
    mitarbeiter_name: r.mitarbeiter_name,
    betrag: Number(r.betrag),
    start_datum: r.start_datum,
    anzahl_raten: r.anzahl_raten,
    intervall: r.intervall,
    hubspot_deal_id: r.hubspot_deal_id,
    source: r.source,
    created_at: r.created_at,
    pending_delete: r.pending_delete,
  };
}

export async function listDeals(): Promise<Deal[]> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDeal(r as DealRow));
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDeal(data as DealRow) : null;
}

export async function createDeal(
  input: Omit<Deal, "id" | "created_at">,
): Promise<Deal> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .insert({
      vorname: input.vorname,
      nachname: input.nachname,
      email: input.email,
      mitarbeiter_id: input.mitarbeiter_id,
      mitarbeiter_name: input.mitarbeiter_name,
      betrag: input.betrag,
      start_datum: input.start_datum,
      anzahl_raten: input.anzahl_raten,
      intervall: input.intervall,
      hubspot_deal_id: input.hubspot_deal_id,
      source: input.source,
      pending_delete: input.pending_delete ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToDeal(data as DealRow);
}

export async function updateDeal(
  id: string,
  patch: Partial<Deal>,
): Promise<Deal | null> {
  // Only forward known columns
  const allowed: (keyof Deal)[] = [
    "vorname", "nachname", "email", "mitarbeiter_id", "mitarbeiter_name",
    "betrag", "start_datum", "anzahl_raten", "intervall",
    "hubspot_deal_id", "source", "pending_delete",
  ];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) update[k] = (patch as Record<string, unknown>)[k];
  if (Object.keys(update).length === 0) return getDeal(id);

  const { data, error } = await supabaseAdmin()
    .from("deals")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDeal(data as DealRow) : null;
}

export async function upsertDealByHubspotId(
  hubspot_deal_id: string,
  data: Omit<Deal, "id" | "created_at" | "hubspot_deal_id" | "source">,
): Promise<Deal> {
  const { data: row, error } = await supabaseAdmin()
    .from("deals")
    .upsert(
      {
        hubspot_deal_id,
        source: "hubspot" as const,
        vorname: data.vorname,
        nachname: data.nachname,
        email: data.email,
        mitarbeiter_id: data.mitarbeiter_id,
        mitarbeiter_name: data.mitarbeiter_name,
        betrag: data.betrag,
        start_datum: data.start_datum,
        anzahl_raten: data.anzahl_raten,
        intervall: data.intervall,
        pending_delete: data.pending_delete ?? false,
      },
      { onConflict: "hubspot_deal_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return rowToDeal(row as DealRow);
}

export async function getDealByHubspotId(
  hubspot_deal_id: string,
): Promise<Deal | null> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select("*")
    .eq("hubspot_deal_id", hubspot_deal_id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDeal(data as DealRow) : null;
}

/**
 * Insert-only HubSpot import: legt einen Deal an, wenn er noch nicht
 * existiert. Wenn ein Deal mit dieser hubspot_deal_id schon da ist, wird
 * NICHTS überschrieben — bestehende Daten bleiben unverändert.
 */
export async function insertHubspotDealIfMissing(
  hubspot_deal_id: string,
  data: {
    vorname: string;
    nachname: string;
    email: string | null;
    mitarbeiter_id: string;
    mitarbeiter_name: string;
    betrag: number;
    default_start_datum: string | null;
  },
): Promise<{ deal: Deal; created: boolean }> {
  const existing = await getDealByHubspotId(hubspot_deal_id);
  if (existing) {
    if (!existing.email && data.email) {
      const updated = await updateDeal(existing.id, { email: data.email });
      return { deal: updated ?? existing, created: false };
    }
    return { deal: existing, created: false };
  }
  const { data: row, error } = await supabaseAdmin()
    .from("deals")
    .insert({
      hubspot_deal_id,
      source: "hubspot" as const,
      vorname: data.vorname,
      nachname: data.nachname,
      email: data.email,
      mitarbeiter_id: data.mitarbeiter_id,
      mitarbeiter_name: data.mitarbeiter_name,
      betrag: data.betrag,
      start_datum: data.default_start_datum,
      anzahl_raten: null,
      intervall: null,
      pending_delete: false,
    })
    .select()
    .single();
  if (error) throw error;
  return { deal: rowToDeal(row as DealRow), created: true };
}

// ── Employees ──────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  email: string;
  name: string;
  hubspot_owner_id: string | null;
  role: "admin" | "member";
  is_setter: boolean | null;
  is_closer: boolean | null;
  setter_hours: string | null;
  invited_at: string | null;
  active: boolean;
  provision_pct: number | string | null;
  closer_fixum_eur: number | string | null;
  employment_start: string | null;
  employment_end: string | null;
  default_qualis: number | string | null;
  default_showup_rate: number | string | null;
  default_close_rate: number | string | null;
  default_avg_contract: number | string | null;
}

function rowToEmployee(r: EmployeeRow): Employee {
  const setterHours = r.setter_hours;
  const validHours = ["20h", "25h", "30h", "35h", "40h"] as const;
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    hubspot_owner_id: r.hubspot_owner_id,
    role: r.role,
    is_setter: r.is_setter ?? false,
    is_closer: r.is_closer ?? true,
    setter_hours:
      setterHours && (validHours as readonly string[]).includes(setterHours)
        ? (setterHours as Employee["setter_hours"])
        : null,
    invited_at: r.invited_at,
    active: r.active,
    provision_pct: r.provision_pct == null ? null : Number(r.provision_pct),
    closer_fixum_eur: r.closer_fixum_eur == null ? null : Number(r.closer_fixum_eur),
    employment_start: r.employment_start ?? null,
    employment_end: r.employment_end ?? null,
    default_qualis: r.default_qualis == null ? null : Number(r.default_qualis),
    default_showup_rate: r.default_showup_rate == null ? null : Number(r.default_showup_rate),
    default_close_rate: r.default_close_rate == null ? null : Number(r.default_close_rate),
    default_avg_contract: r.default_avg_contract == null ? null : Number(r.default_avg_contract),
  };
}

export async function listEmployees(): Promise<Employee[]> {
  const { data, error } = await supabaseAdmin()
    .from("employees")
    .select("*")
    .order("invited_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToEmployee(r as EmployeeRow));
}

export async function getEmployeeByEmail(
  email: string,
): Promise<Employee | null> {
  const { data, error } = await supabaseAdmin()
    .from("employees")
    .select("*")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEmployee(data as EmployeeRow) : null;
}

export async function updateEmployee(
  id: string,
  patch: Partial<
    Pick<
      Employee,
      | "name"
      | "hubspot_owner_id"
      | "active"
      | "role"
      | "is_setter"
      | "is_closer"
      | "setter_hours"
      | "provision_pct"
      | "closer_fixum_eur"
      | "employment_start"
      | "employment_end"
      | "default_qualis"
      | "default_showup_rate"
      | "default_close_rate"
      | "default_avg_contract"
    >
  >,
): Promise<Employee | null> {
  const allowed = [
    "name", "hubspot_owner_id", "active", "role",
    "is_setter", "is_closer", "setter_hours",
    "provision_pct", "closer_fixum_eur",
    "employment_start", "employment_end",
    "default_qualis", "default_showup_rate",
    "default_close_rate", "default_avg_contract",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) update[k] = (patch as Record<string, unknown>)[k];
  if (Object.keys(update).length === 0) {
    const { data } = await supabaseAdmin().from("employees").select("*").eq("id", id).maybeSingle();
    return data ? rowToEmployee(data as EmployeeRow) : null;
  }

  // If name changed, propagate to deals.mitarbeiter_name (matches old behavior).
  let oldName: string | null = null;
  let ownerId: string | null = null;
  if (update.name) {
    const { data: emp } = await supabaseAdmin()
      .from("employees")
      .select("name, hubspot_owner_id")
      .eq("id", id)
      .maybeSingle();
    oldName = (emp?.name as string) ?? null;
    ownerId = (emp?.hubspot_owner_id as string | null) ?? null;
  }

  const { data, error } = await supabaseAdmin()
    .from("employees")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (update.name && oldName && update.name !== oldName) {
    const sb = supabaseAdmin();
    if (ownerId) {
      await sb.from("deals").update({ mitarbeiter_name: update.name as string }).eq("mitarbeiter_id", ownerId);
    }
    await sb.from("deals").update({ mitarbeiter_name: update.name as string }).eq("mitarbeiter_id", id);
  }

  return rowToEmployee(data as EmployeeRow);
}

export async function inviteEmployee(input: {
  email: string;
  name: string;
  hubspot_owner_id?: string | null;
}): Promise<Employee> {
  const existing = await getEmployeeByEmail(input.email);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin()
    .from("employees")
    .insert({
      email: input.email.toLowerCase(),
      name: input.name,
      hubspot_owner_id: input.hubspot_owner_id ?? null,
      role: "member",
      active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToEmployee(data as EmployeeRow);
}

// ── Monthly snapshots ──────────────────────────────────────────────────────

interface SnapshotRow {
  id: string;
  mitarbeiter_id: string;
  month: string;
  qualis: number | string;
  showup_rate: number | string;
  close_rate: number | string;
  avg_contract: number | string | null;
}

function rowToSnapshot(r: SnapshotRow): MonthlySnapshot {
  return {
    id: r.id,
    mitarbeiter_id: r.mitarbeiter_id,
    month: r.month,
    qualis: Number(r.qualis),
    showup_rate: Number(r.showup_rate),
    close_rate: Number(r.close_rate),
    avg_contract: r.avg_contract == null ? null : Number(r.avg_contract),
  };
}

export async function listMonthlySnapshots(
  mitarbeiter_id?: string,
): Promise<MonthlySnapshot[]> {
  let q = supabaseAdmin().from("monthly_snapshots").select("*").order("month", { ascending: true });
  if (mitarbeiter_id) q = q.eq("mitarbeiter_id", mitarbeiter_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => rowToSnapshot(r as SnapshotRow));
}

export async function upsertMonthlySnapshot(
  input: Omit<MonthlySnapshot, "id">,
): Promise<MonthlySnapshot> {
  const { data, error } = await supabaseAdmin()
    .from("monthly_snapshots")
    .upsert(
      {
        mitarbeiter_id: input.mitarbeiter_id,
        month: input.month,
        qualis: input.qualis,
        showup_rate: input.showup_rate,
        close_rate: input.close_rate,
        avg_contract: input.avg_contract ?? null,
      },
      { onConflict: "mitarbeiter_id,month" },
    )
    .select()
    .single();
  if (error) throw error;
  return rowToSnapshot(data as SnapshotRow);
}

// ── Products ───────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  name: string;
  price: number | string;
  default_anzahl_raten: number | null;
  default_intervall: Intervall | null;
  active: boolean;
  is_upsell: boolean;
  sort: number;
}

function rowToProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price),
    default_anzahl_raten: r.default_anzahl_raten,
    default_intervall: r.default_intervall,
    active: r.active,
    is_upsell: r.is_upsell,
    sort: r.sort,
  };
}

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("*")
    .order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToProduct(r as ProductRow));
}

export async function createProduct(
  input: Omit<Product, "id">,
): Promise<Product> {
  const { data, error } = await supabaseAdmin()
    .from("products")
    .insert({
      name: input.name,
      price: input.price,
      default_anzahl_raten: input.default_anzahl_raten,
      default_intervall: input.default_intervall,
      active: input.active,
      is_upsell: input.is_upsell ?? false,
      sort: input.sort,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToProduct(data as ProductRow);
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id">>,
): Promise<Product | null> {
  const allowed = [
    "name", "price", "default_anzahl_raten", "default_intervall",
    "active", "is_upsell", "sort",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) update[k] = (patch as Record<string, unknown>)[k];
  if (Object.keys(update).length === 0) {
    const { data } = await supabaseAdmin().from("products").select("*").eq("id", id).maybeSingle();
    return data ? rowToProduct(data as ProductRow) : null;
  }
  const { data, error } = await supabaseAdmin()
    .from("products")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProduct(data as ProductRow) : null;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin()
    .from("products")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Delete requests ────────────────────────────────────────────────────────

interface DeleteRequestRow {
  id: string;
  deal_id: string;
  requested_by_email: string;
  requested_at: string;
  status: "pending" | "approved" | "denied";
  decided_at: string | null;
}

function rowToDeleteRequest(r: DeleteRequestRow): DeleteRequest {
  return {
    id: r.id,
    deal_id: r.deal_id,
    requested_by_email: r.requested_by_email,
    requested_at: r.requested_at,
    status: r.status,
    decided_at: r.decided_at ?? undefined,
  };
}

export async function listDeleteRequests(): Promise<DeleteRequest[]> {
  const { data, error } = await supabaseAdmin()
    .from("delete_requests")
    .select("*")
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDeleteRequest(r as DeleteRequestRow));
}

export async function createDeleteRequest(input: {
  deal_id: string;
  requested_by_email: string;
}): Promise<DeleteRequest> {
  const sb = supabaseAdmin();
  await sb.from("deals").update({ pending_delete: true }).eq("id", input.deal_id);
  const { data, error } = await sb
    .from("delete_requests")
    .insert({
      deal_id: input.deal_id,
      requested_by_email: input.requested_by_email.toLowerCase(),
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return rowToDeleteRequest(data as DeleteRequestRow);
}

export async function decideDeleteRequest(
  id: string,
  decision: "approved" | "denied",
): Promise<DeleteRequest | null> {
  const sb = supabaseAdmin();
  const { data: dr, error: e1 } = await sb
    .from("delete_requests")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (e1) throw e1;
  if (!dr) return null;
  if (decision === "approved") {
    await sb.from("deals").delete().eq("id", (dr as DeleteRequestRow).deal_id);
  } else {
    await sb.from("deals").update({ pending_delete: false }).eq("id", (dr as DeleteRequestRow).deal_id);
  }
  return rowToDeleteRequest(dr as DeleteRequestRow);
}
