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

/** Standalone /notiz-Seite und sonstige Beta-Tools. */
export function canUseRechnungsBot(
  ctx: Pick<SessionContext, "isAdmin" | "user"> | null,
): boolean {
  if (!ctx?.isAdmin) return false;
  const email = ctx.user.email.trim().toLowerCase();
  return allowedEmails().includes(email);
}

/** Rechnung erstellen / Mandat anlegen / Vertrag-Parsen fuer
 *  einen Deal: Admin oder zustaendiger Mitarbeiter. */
export function canCreateRechnungForDeal(
  ctx: Pick<SessionContext, "isAdmin" | "ownerId"> | null,
  dealMitarbeiterId: string | null | undefined,
): boolean {
  if (!ctx) return false;
  if (ctx.isAdmin) return true;
  return !!dealMitarbeiterId && dealMitarbeiterId === ctx.ownerId;
}

/** Mahnungen, Inkasso-Versand, Mandat-Storno: Admin only. */
export function canManageDunning(
  ctx: Pick<SessionContext, "isAdmin"> | null,
): boolean {
  return !!ctx?.isAdmin;
}

/** Manuelles Mandat anlegen (ohne Vertrag) + Inkasso-Stage-Setzung:
 *  Admin only (Buchhaltung). */
export function canManagePayments(
  ctx: Pick<SessionContext, "isAdmin"> | null,
): boolean {
  return !!ctx?.isAdmin;
}
