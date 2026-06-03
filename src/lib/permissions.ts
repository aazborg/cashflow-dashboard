/**
 * Feature-spezifische Berechtigungen.
 *
 * Rollen:
 *   - admin: voller Zugriff
 *   - member: kann Rechnungen + Mandate fuer eigene Deals anlegen
 *
 * Beta-Restriktion (nur fuer /notiz Standalone-Seite + ggf. weitere):
 *   canUseRechnungsBot(ctx) -- Admin + Email in Allowlist
 *   (Allowlist via env RECHNUNG_BOT_ALLOWED_EMAILS, default Mario).
 *
 * Per-Deal-Rechte:
 *   canCreateRechnungForDeal -- Admin ODER eigener Deal
 *   canManageDunning         -- Admin only (Mahnungen, Inkasso,
 *                                 Mandat-Storno)
 *   canManagePayments        -- Admin only (Manual Mandate, Cancel)
 */

import type { SessionContext } from "./supabase-server";

const DEFAULT_ALLOWED = ["mario.grabner@mynlp.at"];

function allowedEmails(): string[] {
  const raw = process.env.RECHNUNG_BOT_ALLOWED_EMAILS;
  if (!raw) return DEFAULT_ALLOWED;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Standalone /notiz-Seite (Angebots-Notiz-Generator).
 *  Freigegeben fuer alle Sales-Mitarbeiter (Closer + Setter) +
 *  Admins. Accounting hat kein Sales-Kundenkontakt -> kein Zugriff.
 *  Beta-Allowlist (env RECHNUNG_BOT_ALLOWED_EMAILS) wirkt nur noch
 *  als FORCE-OPEN: wer in der Liste steht, kommt rein -- alle
 *  Sales-Rollen kommen ohnehin rein. */
export function canUseRechnungsBot(
  ctx: Pick<
    SessionContext,
    "isAdmin" | "isCloser" | "isSetter" | "user"
  > | null,
): boolean {
  if (!ctx) return false;
  if (ctx.isAdmin) return true;
  if (ctx.isCloser || ctx.isSetter) return true;
  const email = ctx.user.email.trim().toLowerCase();
  return allowedEmails().includes(email);
}

/** Rechnung erstellen / Mandat anlegen / Vertrag-Parsen fuer
 *  einen Deal: Admin, Accounting oder zustaendiger Mitarbeiter. */
export function canCreateRechnungForDeal(
  ctx: Pick<SessionContext, "isAdmin" | "isAccounting" | "ownerId"> | null,
  dealMitarbeiterId: string | null | undefined,
): boolean {
  if (!ctx) return false;
  if (ctx.isAdmin || ctx.isAccounting) return true;
  return !!dealMitarbeiterId && dealMitarbeiterId === ctx.ownerId;
}

/** Mahnungen, Inkasso-Versand, Mandat-Storno: Admin + Accounting. */
export function canManageDunning(
  ctx: Pick<SessionContext, "isAdmin" | "isAccounting"> | null,
): boolean {
  return !!(ctx?.isAdmin || ctx?.isAccounting);
}

/** Manuelles Mandat anlegen (ohne Vertrag) + Inkasso-Stage-Setzung:
 *  Admin + Accounting (Buchhaltung). */
export function canManagePayments(
  ctx: Pick<SessionContext, "isAdmin" | "isAccounting"> | null,
): boolean {
  return !!(ctx?.isAdmin || ctx?.isAccounting);
}

/** Sieht alle Deals (nicht nur eigene): Admin + Accounting. */
export function canSeeAllDeals(
  ctx: Pick<SessionContext, "isAdmin" | "isAccounting"> | null,
): boolean {
  return !!(ctx?.isAdmin || ctx?.isAccounting);
}

/** Darf Sales-Dashboards/Rechner/Statistik sehen: alle ausser
 *  reine Accounting-Rolle. Admins sehen alles. Customer-Happiness
 *  hat KEIN Sales-Sicht. */
export function canSeeRevenueDashboards(
  ctx: Pick<
    SessionContext,
    "isAdmin" | "isAccounting" | "isCustomerHappiness"
  > | null,
): boolean {
  if (!ctx) return false;
  if (ctx.isAdmin) return true;
  if (ctx.isAccounting) return false;
  if (ctx.isCustomerHappiness) return false;
  return true;
}

/** Customer-Happiness-Bereich (Teilnehmer-Management).
 *  Admin + dedizierte customer_happiness-Rolle. */
export function canSeeCustomerHappiness(
  ctx: Pick<
    SessionContext,
    "isAdmin" | "isCustomerHappiness"
  > | null,
): boolean {
  if (!ctx) return false;
  return !!(ctx.isAdmin || ctx.isCustomerHappiness);
}

/** Seminarmanagement-Bereich (Vorbereitung, Bestellungen).
 *  Admin + dedizierte seminarmanagement-Rolle. */
export function canSeeSeminarmanagement(
  ctx: Pick<
    SessionContext,
    "isAdmin" | "isSeminarmanagement"
  > | null,
): boolean {
  if (!ctx) return false;
  return !!(ctx.isAdmin || ctx.isSeminarmanagement);
}
