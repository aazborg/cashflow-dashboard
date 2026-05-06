"use server";

import { revalidatePath } from "next/cache";
import {
  createDeal,
  createDeleteRequest,
  createProduct,
  decideDeleteRequest,
  deleteProduct,
  getDeal,
  inviteEmployee,
  updateDeal,
  updateEmployee,
  updateProduct,
} from "./store";
import { syncHubspotWonDeals, type SyncSummary } from "./hubspot-sync";
import {
  syncMonthlySnapshots,
  type SnapshotsSyncSummary,
} from "./hubspot-snapshots-sync";
import { getSessionContext } from "./supabase-server";
import type { Intervall } from "./types";
import { INTERVALL_OPTIONS } from "./types";

async function requireSession() {
  const ctx = await getSessionContext();
  if (!ctx) throw new Error("Nicht angemeldet.");
  return ctx;
}

async function requireAdmin() {
  const ctx = await requireSession();
  if (!ctx.isAdmin) throw new Error("Keine Berechtigung.");
  return ctx;
}

function parseIntervall(v: FormDataEntryValue | null): Intervall | null {
  if (typeof v !== "string" || !v) return null;
  return INTERVALL_OPTIONS.includes(v as Intervall) ? (v as Intervall) : null;
}

function parseNumber(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function updateDealAction(formData: FormData) {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  if (!ctx.isAdmin) {
    const existing = await getDeal(id);
    if (!existing || existing.mitarbeiter_id !== ctx.ownerId) {
      throw new Error("Keine Berechtigung für diesen Deal.");
    }
  }
  const start = formData.get("start_datum");
  const raten = parseNumber(formData.get("anzahl_raten"));
  const intervall = parseIntervall(formData.get("intervall"));
  const betrag = parseNumber(formData.get("betrag"));

  const patch: Record<string, unknown> = {};
  if (typeof start === "string") {
    patch.start_datum = start || null;
  }
  if (raten !== null) patch.anzahl_raten = Math.max(1, Math.round(raten));
  if (intervall) patch.intervall = intervall;
  if (betrag !== null) patch.betrag = betrag;

  await updateDeal(id, patch);
  revalidatePath("/daten");
  revalidatePath("/");
}

export async function createDealAction(formData: FormData) {
  const ctx = await requireSession();
  const vorname = String(formData.get("vorname") ?? "").trim();
  const nachname = String(formData.get("nachname") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  // Admins may pick any mitarbeiter from the form; members are pinned to their
  // own ownerId so they can't create deals attributed to others.
  const mitarbeiter_id = ctx.isAdmin
    ? String(formData.get("mitarbeiter_id") ?? "").trim() || "manual"
    : ctx.ownerId;
  const mitarbeiter_name = ctx.isAdmin
    ? String(formData.get("mitarbeiter_name") ?? "").trim() || "Manuell"
    : ctx.employee.name;
  const betrag = parseNumber(formData.get("betrag")) ?? 0;
  const startRaw = formData.get("start_datum");
  const start_datum = typeof startRaw === "string" && startRaw ? startRaw : null;
  const anzahl_raten = parseNumber(formData.get("anzahl_raten"));
  const intervall = parseIntervall(formData.get("intervall"));

  if (!vorname || !nachname || !betrag) return;

  await createDeal({
    vorname,
    nachname,
    email,
    mitarbeiter_id,
    mitarbeiter_name,
    betrag,
    start_datum,
    anzahl_raten: anzahl_raten ? Math.max(1, Math.round(anzahl_raten)) : null,
    intervall,
    hubspot_deal_id: null,
    source: "manual",
  });
  revalidatePath("/daten");
  revalidatePath("/");
}

export async function requestDeleteAction(formData: FormData) {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  if (!ctx.isAdmin) {
    const existing = await getDeal(id);
    if (!existing || existing.mitarbeiter_id !== ctx.ownerId) {
      throw new Error("Keine Berechtigung für diesen Deal.");
    }
  }
  await createDeleteRequest({
    deal_id: id,
    requested_by_email: ctx.user.email,
  });
  revalidatePath("/daten");
  revalidatePath("/admin");
}

export async function decideDeleteAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "denied")) return;
  await decideDeleteRequest(id, decision);
  revalidatePath("/admin");
  revalidatePath("/daten");
  revalidatePath("/");
}

function parseOptionalNumber(
  v: FormDataEntryValue | null,
  opts: { min?: number; max?: number } = {},
): number | null | undefined {
  if (typeof v !== "string") return undefined;
  if (v === "") return null;
  const n = parseNumber(v);
  if (n === null) return undefined;
  let val = n;
  if (opts.min != null) val = Math.max(opts.min, val);
  if (opts.max != null) val = Math.min(opts.max, val);
  return val;
}

export async function updateEmployeeAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const name = String(formData.get("name") ?? "").trim();
  const hubspot_owner_id =
    String(formData.get("hubspot_owner_id") ?? "").trim() || null;

  const patch: Partial<{
    name: string;
    hubspot_owner_id: string | null;
    provision_pct: number | null;
    default_qualis: number | null;
    default_showup_rate: number | null;
    default_close_rate: number | null;
    default_avg_contract: number | null;
  }> = {};
  if (name) patch.name = name;
  patch.hubspot_owner_id = hubspot_owner_id;

  const provision = parseOptionalNumber(formData.get("provision_pct"), {
    min: 0,
    max: 100,
  });
  if (provision !== undefined) patch.provision_pct = provision;

  const qualis = parseOptionalNumber(formData.get("default_qualis"), { min: 0 });
  if (qualis !== undefined) patch.default_qualis = qualis;

  const showup = parseOptionalNumber(formData.get("default_showup_rate"), {
    min: 0,
    max: 100,
  });
  if (showup !== undefined) patch.default_showup_rate = showup;

  const close = parseOptionalNumber(formData.get("default_close_rate"), {
    min: 0,
    max: 100,
  });
  if (close !== undefined) patch.default_close_rate = close;

  const avg = parseOptionalNumber(formData.get("default_avg_contract"), {
    min: 0,
  });
  if (avg !== undefined) patch.default_avg_contract = avg;

  await updateEmployee(id, patch);
  revalidatePath("/admin");
  revalidatePath("/daten");
  revalidatePath("/rechner");
  revalidatePath("/");
}

export async function createProductAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const price = parseNumber(formData.get("price")) ?? 0;
  const anzahl_raten = parseNumber(formData.get("default_anzahl_raten"));
  const intervall = parseIntervall(formData.get("default_intervall"));
  if (!name || price <= 0) return;
  await createProduct({
    name,
    price,
    default_anzahl_raten: anzahl_raten ? Math.max(1, Math.round(anzahl_raten)) : null,
    default_intervall: intervall,
    active: true,
    sort: Date.now(),
  });
  revalidatePath("/admin");
  revalidatePath("/ziele");
}

export async function updateProductAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const patch: Record<string, unknown> = {};
  const name = String(formData.get("name") ?? "").trim();
  if (name) patch.name = name;
  const price = parseOptionalNumber(formData.get("price"), { min: 0 });
  if (price !== undefined && price !== null) patch.price = price;
  const raten = parseOptionalNumber(formData.get("default_anzahl_raten"), { min: 1 });
  if (raten !== undefined) patch.default_anzahl_raten = raten === null ? null : Math.round(raten);
  const intervallRaw = formData.get("default_intervall");
  if (typeof intervallRaw === "string") {
    patch.default_intervall = intervallRaw === "" ? null : parseIntervall(intervallRaw);
  }
  const activeRaw = formData.get("active");
  if (activeRaw !== null) patch.active = activeRaw === "true" || activeRaw === "on";
  const upsellRaw = formData.get("is_upsell");
  if (upsellRaw !== null) patch.is_upsell = upsellRaw === "true" || upsellRaw === "on";
  await updateProduct(id, patch);
  revalidatePath("/admin");
  revalidatePath("/ziele");
}

export async function deleteProductAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteProduct(id);
  revalidatePath("/admin");
  revalidatePath("/ziele");
}

export async function inviteEmployeeAction(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const hubspot_owner_id =
    String(formData.get("hubspot_owner_id") ?? "").trim() || null;
  if (!email || !name) return;
  await inviteEmployee({ email, name, hubspot_owner_id });
  revalidatePath("/admin");
}

export interface SyncResult {
  ok: boolean;
  summary?: SyncSummary;
  error?: string;
}

export async function syncHubspotDealsAction(): Promise<SyncResult> {
  await requireAdmin();
  try {
    const summary = await syncHubspotWonDeals();
    revalidatePath("/daten");
    revalidatePath("/");
    return { ok: true, summary };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface SnapshotsResult {
  ok: boolean;
  summary?: SnapshotsSyncSummary;
  error?: string;
}

export async function syncHubspotSnapshotsAction(): Promise<SnapshotsResult> {
  await requireAdmin();
  try {
    const now = new Date();
    const toMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const summary = await syncMonthlySnapshots({
      fromMonth: "2026-01",
      toMonth,
    });
    revalidatePath("/");
    revalidatePath("/rechner");
    revalidatePath("/ziele");
    return { ok: true, summary };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
