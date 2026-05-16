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
  betrag_original: number | string | null;
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
    betrag_original: r.betrag_original == null ? null : Number(r.betrag_original),
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
      betrag_original: input.betrag_original ?? input.betrag,
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
    "betrag", "betrag_original", "start_datum", "anzahl_raten", "intervall",
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

/**
 * Wird vom Legacy-Webhook-Pfad benutzt. Bei BESTEHENDEN Deals dürfen
 * dashboard-editierte Felder NICHT überschrieben werden (sonst macht der
 * nächste HubSpot-Sync die Mitarbeiter-Anpassungen kaputt):
 *   - betrag (Provisions-Basis)     → bleibt
 *   - start_datum / anzahl_raten / intervall (Cashflow-Plan)  → bleibt
 *   - email                          → nur befüllen, wenn bisher leer
 * Folgende Felder werden synchronisiert (HubSpot-Wahrheit):
 *   - vorname / nachname / mitarbeiter_id / mitarbeiter_name
 *   - betrag_original (Original-HubSpot-Wert)
 *
 * Bei NEUEN Deals werden alle Felder gesetzt; betrag und betrag_original
 * starten gleich mit dem HubSpot-Wert.
 */
export async function upsertDealByHubspotId(
  hubspot_deal_id: string,
  data: Omit<Deal, "id" | "created_at" | "hubspot_deal_id" | "source">,
): Promise<Deal> {
  const existing = await getDealByHubspotId(hubspot_deal_id);
  if (existing) {
    const hubspotAmount = data.betrag_original ?? data.betrag;
    const patch: Partial<Deal> = {
      vorname: data.vorname,
      nachname: data.nachname,
      mitarbeiter_id: data.mitarbeiter_id,
      mitarbeiter_name: data.mitarbeiter_name,
    };
    if (!existing.email && data.email) patch.email = data.email;
    if (existing.betrag_original !== hubspotAmount) {
      patch.betrag_original = hubspotAmount;
    }
    const updated = await updateDeal(existing.id, patch);
    return updated ?? existing;
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
      betrag_original: data.betrag_original ?? data.betrag,
      start_datum: data.start_datum,
      anzahl_raten: data.anzahl_raten,
      intervall: data.intervall,
      pending_delete: data.pending_delete ?? false,
    })
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
 * Sucht einen Deal in der DB, der vom HubSpot-Sync potenziell überschrieben
 * werden könnte, falls noch keine hubspot_deal_id-Verknüpfung existiert.
 * Wird genutzt, damit der tägliche Sync existierende manuell angelegte
 * Deals MIT bestehenden Beträgen findet und verlinkt, statt Duplikate zu
 * erzeugen.
 *
 * Reihenfolge: Email-Match (mit start_datum-Disambiguation, falls mehrere),
 * dann name+mitarbeiter-Match.
 */
async function findLinkableDeal(data: {
  vorname: string;
  nachname: string;
  email: string | null;
  mitarbeiter_id: string;
  default_start_datum: string | null;
}): Promise<DealRow | null> {
  const supabase = supabaseAdmin();
  const hubspotMonth = data.default_start_datum?.slice(0, 7) ?? null;

  function pickFromCandidates(rows: DealRow[]): DealRow | null {
    const open = rows.filter((r) => !r.hubspot_deal_id && !r.pending_delete);
    if (open.length === 0) return null;
    if (open.length === 1) return open[0];
    if (hubspotMonth) {
      const byMonth = open.filter(
        (r) =>
          r.start_datum && r.start_datum.slice(0, 7) === hubspotMonth,
      );
      if (byMonth.length === 1) return byMonth[0];
      const noStart = open.filter((r) => !r.start_datum);
      if (noStart.length === 1) return noStart[0];
    }
    return null; // ambig, lieber nichts tun
  }

  if (data.email) {
    const { data: byEmail } = await supabase
      .from("deals")
      .select("*")
      .ilike("email", data.email)
      .limit(10);
    const picked = pickFromCandidates((byEmail ?? []) as DealRow[]);
    if (picked) return picked;
  }

  const { data: byName } = await supabase
    .from("deals")
    .select("*")
    .ilike("vorname", data.vorname)
    .ilike("nachname", data.nachname)
    .eq("mitarbeiter_id", data.mitarbeiter_id)
    .limit(10);
  const pickedByName = pickFromCandidates((byName ?? []) as DealRow[]);
  return pickedByName;
}

/**
 * HubSpot-Sync-Endpoint: legt einen Deal an, wenn er noch nicht existiert.
 * Existiert er bereits — entweder über hubspot_deal_id oder über
 * Email/Name+Mitarbeiter — wird er verlinkt:
 *   - hubspot_deal_id gesetzt (falls noch null)
 *   - betrag_original auf den aktuellen HubSpot-Wert nachgezogen
 *   - email nachgezogen, wenn HubSpot eine liefert und die Spalte leer war
 *   - betrag (Provisions-Basis) bleibt unverändert — der Mitarbeiter-Edit
 *     überlebt jeden Sync
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
): Promise<{ deal: Deal; created: boolean; linked: boolean }> {
  // 1) Direkter Match per hubspot_deal_id
  const byHubspotId = await getDealByHubspotId(hubspot_deal_id);
  if (byHubspotId) {
    const patch: Partial<Deal> = {};
    if (!byHubspotId.email && data.email) patch.email = data.email;
    if (byHubspotId.betrag_original !== data.betrag) {
      patch.betrag_original = data.betrag;
    }
    if (Object.keys(patch).length > 0) {
      const updated = await updateDeal(byHubspotId.id, patch);
      return { deal: updated ?? byHubspotId, created: false, linked: false };
    }
    return { deal: byHubspotId, created: false, linked: false };
  }

  // 2) Fuzzy-Link: bestehenden Deal ohne hubspot_deal_id finden und verknüpfen,
  //    statt zu duplizieren.
  const linkable = await findLinkableDeal(data);
  if (linkable) {
    const patch: Partial<Deal> = {
      hubspot_deal_id,
      betrag_original: data.betrag,
    };
    if (!linkable.email && data.email) patch.email = data.email;
    const updated = await updateDeal(linkable.id, patch);
    return {
      deal: updated ?? (rowToDeal(linkable as DealRow) as Deal),
      created: false,
      linked: true,
    };
  }

  // 3) Wirklich neuer Deal — anlegen.
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
      betrag_original: data.betrag,
      start_datum: data.default_start_datum,
      anzahl_raten: null,
      intervall: null,
      pending_delete: false,
    })
    .select()
    .single();
  if (error) throw error;
  return { deal: rowToDeal(row as DealRow), created: true, linked: false };
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

/**
 * Hard-Delete mehrerer Deals in einem Schritt. Verbundene
 * delete_requests werden mit gelöscht (FK-Cascade gibt's hier nicht,
 * darum explizit). Liefert die Anzahl tatsächlich gelöschter Zeilen.
 */
export async function deleteDealsByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = supabaseAdmin();
  // 1) Etwaige offene delete_requests aufräumen, sonst FK-Verstoß
  await supabase.from("delete_requests").delete().in("deal_id", ids);
  // 2) Deals selbst löschen
  const { error, count } = await supabase
    .from("deals")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Hard-Delete eines Mitarbeiters. Verbundene Daten (Funnel-Snapshots,
 * Setter-Qualis) werden mit aufgeräumt. Deals bleiben unverändert — der
 * mitarbeiter_name ist dort denormalisiert gespeichert, historische
 * Provisionen / Cashflow-Beiträge sollen erhalten bleiben.
 *
 * Wirft, wenn der zu löschende Mitarbeiter der letzte aktive Admin ist.
 */
export async function deleteEmployee(id: string): Promise<void> {
  const supabase = supabaseAdmin();
  // 1) Sicherheitscheck: nicht den letzten aktiven Admin löschen.
  const { data: emp } = await supabase
    .from("employees")
    .select("id, role, active, hubspot_owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!emp) return; // nichts zu tun
  if ((emp as { role: string; active: boolean }).role === "admin" && (emp as { active: boolean }).active) {
    const { count } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("active", true);
    if ((count ?? 0) <= 1) {
      throw new Error(
        "Mindestens ein aktiver Admin muss bestehen bleiben. Lösche zuerst einen anderen Admin oder degradiere ihn zu 'member'.",
      );
    }
  }
  // 2) Verbundene Daten aufräumen, die ausschließlich diesen Mitarbeiter referenzieren.
  const ownerId = (emp as { hubspot_owner_id: string | null }).hubspot_owner_id;
  const idsToMatch = ownerId ? [id, ownerId] : [id];
  await supabase
    .from("setter_monthly_qualis")
    .delete()
    .in("mitarbeiter_id", idsToMatch);
  await supabase
    .from("monthly_snapshots")
    .delete()
    .in("mitarbeiter_id", idsToMatch);
  // 3) Mitarbeiter-Zeile löschen.
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
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

// ── Setter Monthly Qualis ──────────────────────────────────────────────────

interface SetterMonthlyQualisRow {
  id: string;
  mitarbeiter_id: string;
  month: string;
  qualis: number;
  updated_at: string;
}

export async function listSetterQualis(): Promise<
  import("./types").SetterMonthlyQualis[]
> {
  const { data, error } = await supabaseAdmin()
    .from("setter_monthly_qualis")
    .select("*")
    .order("month", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as SetterMonthlyQualisRow;
    return {
      id: row.id,
      mitarbeiter_id: row.mitarbeiter_id,
      month: row.month,
      qualis: row.qualis,
      updated_at: row.updated_at,
    };
  });
}

export async function getSetterQualisForMonth(
  month: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin()
    .from("setter_monthly_qualis")
    .select("mitarbeiter_id, qualis")
    .eq("month", month);
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of data ?? []) {
    const row = r as { mitarbeiter_id: string; qualis: number };
    out.set(row.mitarbeiter_id, row.qualis);
  }
  return out;
}

export async function upsertSetterQualis(input: {
  mitarbeiter_id: string;
  month: string;
  qualis: number;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("setter_monthly_qualis")
    .upsert(
      {
        mitarbeiter_id: input.mitarbeiter_id,
        month: input.month,
        qualis: Math.max(0, Math.round(input.qualis)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "mitarbeiter_id,month" },
    );
  if (error) throw error;
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
