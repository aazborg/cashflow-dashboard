"use server";

import { revalidatePath } from "next/cache";
import {
  createDeal,
  createDeleteRequest,
  createProduct,
  createRechnerEvent,
  decideDeleteRequest,
  deleteDealsByIds,
  deleteEmployee,
  deleteProduct,
  getDeal,
  inviteEmployee,
  listEmployees,
  updateDeal,
  updateEmployee,
  updateProduct,
  upsertSetterQualis,
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
  // Original-Betrag dürfen nur Admins ändern. Members können das Feld
  // gar nicht aus dem Formular schicken (UI versteckt es), aber wir
  // filtern hier zusätzlich serverseitig.
  if (ctx.isAdmin && formData.has("betrag_original")) {
    const raw = String(formData.get("betrag_original") ?? "").trim();
    if (raw === "") {
      patch.betrag_original = null;
    } else {
      const parsed = parseNumber(raw);
      if (parsed !== null) patch.betrag_original = parsed;
    }
  }

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

/**
 * Bulk-Hard-Delete für Admins: löscht eine Liste von Deal-IDs sofort,
 * ohne Lösch-Request-Workflow. Mitarbeiter (non-admin) bekommen 401.
 */
export async function bulkDeleteDealsAction(formData: FormData): Promise<{
  ok: boolean;
  deleted: number;
  error?: string;
}> {
  await requireAdmin();
  const idsRaw = String(formData.get("ids") ?? "");
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return { ok: true, deleted: 0 };
  try {
    const deleted = await deleteDealsByIds(ids);
    revalidatePath("/daten");
    revalidatePath("/");
    revalidatePath("/gesamt-cashflow");
    return { ok: true, deleted };
  } catch (err) {
    return {
      ok: false,
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
    role: "admin" | "member";
    is_setter: boolean;
    is_closer: boolean;
    setter_hours: "20h" | "25h" | "30h" | "35h" | "40h" | null;
    provision_pct: number | null;
    closer_fixum_eur: number | null;
    employment_start: string | null;
    employment_end: string | null;
    default_qualis: number | null;
    default_showup_rate: number | null;
    default_close_rate: number | null;
    default_avg_contract: number | null;
  }> = {};
  if (name) patch.name = name;
  patch.hubspot_owner_id = hubspot_owner_id;

  const roleRaw = String(formData.get("role") ?? "").trim();
  if (roleRaw === "admin" || roleRaw === "member") patch.role = roleRaw;

  // Mehrfach-Rollen (orthogonal zur admin/member-Spalte): is_setter, is_closer.
  // Werden nur gesetzt, wenn die jeweilige Spalte im Formular vorhanden ist.
  if (formData.has("is_setter")) {
    patch.is_setter = formData.get("is_setter") === "true";
  }
  if (formData.has("is_closer")) {
    patch.is_closer = formData.get("is_closer") === "true";
  }
  const hoursRaw = String(formData.get("setter_hours") ?? "").trim();
  if (formData.has("setter_hours")) {
    if (hoursRaw === "") patch.setter_hours = null;
    else if (["20h", "25h", "30h", "35h", "40h"].includes(hoursRaw)) {
      patch.setter_hours = hoursRaw as "20h" | "25h" | "30h" | "35h" | "40h";
    }
  }

  // Schutz: nicht den letzten aktiven Admin auf member herabstufen.
  if (patch.role === "member") {
    const all = await listEmployees();
    const activeAdmins = all.filter((e) => e.role === "admin" && e.active);
    const isCurrentlyActiveAdmin = activeAdmins.some((e) => e.id === id);
    if (isCurrentlyActiveAdmin && activeAdmins.length <= 1) {
      throw new Error(
        "Mindestens ein aktiver Admin muss bestehen bleiben.",
      );
    }
  }

  const provision = parseOptionalNumber(formData.get("provision_pct"), {
    min: 0,
    max: 100,
  });
  if (provision !== undefined) patch.provision_pct = provision;

  const closerFixum = parseOptionalNumber(formData.get("closer_fixum_eur"), {
    min: 0,
  });
  if (closerFixum !== undefined) patch.closer_fixum_eur = closerFixum;

  // Datumsfelder: leerer String → null, sonst YYYY-MM-DD durchreichen.
  if (formData.has("employment_start")) {
    const v = String(formData.get("employment_start") ?? "").trim();
    patch.employment_start = v === "" ? null : v;
  }
  if (formData.has("employment_end")) {
    const v = String(formData.get("employment_end") ?? "").trim();
    patch.employment_end = v === "" ? null : v;
  }

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
  revalidatePath("/setter");
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

export async function deleteEmployeeAction(formData: FormData) {
  const ctx = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("id ist erforderlich.");
  // Self-Delete blockieren — der eingeloggte Admin kann sich selbst nicht
  // wegnehmen, sonst hat er nach Reload keinen Zugang mehr.
  if (ctx.employee.id === id) {
    throw new Error("Du kannst dich nicht selbst löschen.");
  }
  await deleteEmployee(id);
  revalidatePath("/admin");
}

/**
 * Aktiviert oder deaktiviert einen Mitarbeiter. Inaktive Mitarbeiter:
 *   - können sich nicht mehr einloggen (Session-Check in getSessionContext)
 *   - tauchen nicht mehr in der Provisions-Mail an Plank auf
 *   - alle historischen Cashflows, Deals und Auszahlungen bleiben unangetastet
 *
 * Schutz: letzten aktiven Admin nicht deaktivieren; sich selbst nicht
 * deaktivieren.
 */
export async function toggleEmployeeActiveAction(formData: FormData) {
  const ctx = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const active = formData.get("active") === "true";
  if (!id) throw new Error("id ist erforderlich.");

  // Self-Deactivate blockieren.
  if (!active && ctx.employee.id === id) {
    throw new Error(
      "Du kannst dich nicht selbst deaktivieren — sonst kommst du nach dem nächsten Login nicht mehr rein.",
    );
  }

  // Letzten aktiven Admin nicht deaktivieren.
  if (!active) {
    const all = await listEmployees();
    const target = all.find((e) => e.id === id);
    if (target?.role === "admin" && target.active) {
      const otherActiveAdmins = all.filter(
        (e) => e.role === "admin" && e.active && e.id !== id,
      );
      if (otherActiveAdmins.length === 0) {
        throw new Error(
          "Mindestens ein aktiver Admin muss bestehen bleiben. Promote zuerst einen anderen Mitarbeiter zu admin.",
        );
      }
    }
  }

  await updateEmployee(id, { active });
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

export async function logRechnerEventAction(formData: FormData) {
  // Jeder eingeloggte User darf seine eigene Rechner-Aktivität loggen — wir
  // pinnen mitarbeiter_id immer auf den eingeloggten Owner, damit niemand
  // im Namen eines anderen Events erzeugt.
  const ctx = await requireSession();
  const mode = String(formData.get("mode") ?? "").trim();
  if (mode !== "provision" && mode !== "umsatz" && mode !== "setter") return;
  const num = (v: FormDataEntryValue | null): number => {
    if (typeof v !== "string") return 0;
    const n = Number.parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const qualis = Math.max(0, Math.round(num(formData.get("qualis"))));
  const showup = num(formData.get("showup"));
  const close_rate = num(formData.get("close_rate"));
  const avg_contract = num(formData.get("avg_contract"));
  const expected_value = num(formData.get("expected_value"));
  const data_month = String(formData.get("data_month") ?? "").trim() || null;
  await createRechnerEvent({
    mitarbeiter_id: ctx.ownerId,
    mitarbeiter_name: ctx.employee.name,
    user_email: ctx.employee.email,
    mode,
    qualis,
    showup,
    close_rate,
    avg_contract,
    expected_value,
    data_month,
  });
}

export async function upsertSetterQualisAction(formData: FormData) {
  await requireAdmin();
  const mitarbeiter_id = String(formData.get("mitarbeiter_id") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();
  const qualisRaw = String(formData.get("qualis") ?? "").trim();
  if (!mitarbeiter_id || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("mitarbeiter_id und month (YYYY-MM) sind erforderlich.");
  }
  const qualis = Number.parseInt(qualisRaw || "0", 10);
  if (!Number.isFinite(qualis) || qualis < 0) {
    throw new Error("qualis muss eine nicht-negative Ganzzahl sein.");
  }
  await upsertSetterQualis({ mitarbeiter_id, month, qualis });
  revalidatePath("/admin");
}

export interface SendProvisionsResult {
  ok: boolean;
  message: string;
  mode?: "live" | "reminder" | "blocked";
  missing?: { name: string; setter_hours: string | null }[];
}

export async function sendProvisionsNowAction(
  formData?: FormData,
): Promise<SendProvisionsResult> {
  await requireAdmin();
  const monthRaw = formData ? String(formData.get("month") ?? "").trim() : "";
  const month =
    monthRaw && /^\d{4}-\d{2}$/.test(monthRaw)
      ? monthRaw
      : (() => {
          const n = new Date();
          return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
        })();

  if (process.env.PROVISIONS_EMAIL_LIVE !== "true") {
    return {
      ok: false,
      mode: "blocked",
      message:
        "PROVISIONS_EMAIL_LIVE ist nicht auf 'true' gesetzt — produktive Mails an Plank sind deaktiviert. ENV-Variable setzen, um scharf zu schalten.",
    };
  }
  const toEmail = process.env.PROVISIONS_TO_EMAIL;
  if (!toEmail) {
    return { ok: false, message: "PROVISIONS_TO_EMAIL ist nicht gesetzt." };
  }
  const ccEmail = process.env.PROVISIONS_CC_EMAIL;
  const fromName = process.env.PROVISIONS_FROM_NAME ?? "Dr. Mario Grabner";
  const fromEmail = process.env.PROVISIONS_FROM_EMAIL ?? process.env.SMTP_USER;
  if (!fromEmail) {
    return {
      ok: false,
      message: "PROVISIONS_FROM_EMAIL oder SMTP_USER muss gesetzt sein.",
    };
  }
  const from = `${fromName} <${fromEmail}>`;

  // Heavy lifting in eigenem Module-Load (vermeidet Top-of-File-Imports).
  const { listDeals, listEmployees, getSetterQualisForMonth } = await import(
    "./store"
  );
  const {
    buildProvisionsEmail,
    computeMonthlyClosers,
    computeMonthlySetters,
    findMissingQualisSetters,
  } = await import("./provisions-email");
  const { sendMail } = await import("./mailer");

  const [deals, employees, qualisMap] = await Promise.all([
    listDeals(),
    listEmployees(),
    getSetterQualisForMonth(month),
  ]);

  // Wenn Qualis fehlen, blockiere den Send — UI zeigt die Liste.
  const presenceSet = new Set(qualisMap.keys());
  const missing = findMissingQualisSetters(employees, presenceSet);
  if (missing.length > 0) {
    return {
      ok: false,
      mode: "blocked",
      message:
        "Es fehlen Qualis-Einträge für folgende Setter. Bitte oben eintragen und erneut klicken.",
      missing: missing.map((m) => ({
        name: m.name,
        setter_hours: m.setter_hours,
      })),
    };
  }

  const closers = computeMonthlyClosers(month, deals, employees);
  const setters = computeMonthlySetters(month, employees, qualisMap);
  const email = buildProvisionsEmail(month, closers, setters);

  try {
    await sendMail({
      from,
      to: toEmail,
      cc: ccEmail,
      subject: email.subject,
      text: email.textBody,
      html: email.htmlBody,
    });
    return {
      ok: true,
      mode: "live",
      message: `Provisions-Mail für ${month} an ${toEmail} versendet${
        ccEmail ? ` (CC ${ccEmail})` : ""
      }. ${closers.length} Closer, ${setters.length} Setter.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        "Versand fehlgeschlagen: " +
        (err instanceof Error ? err.message : String(err)),
    };
  }
}
