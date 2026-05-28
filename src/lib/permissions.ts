/**
 * Feature-spezifische Berechtigungen.
 *
 * Aktuell: Rechnungs-Bot ist ein Beta-Feature, das nur bestimmte
 * Admins benutzen dürfen ("Nur Mario bis Stabilität bewiesen").
 *
 * Liste kommt aus env RECHNUNG_BOT_ALLOWED_EMAILS (kommagetrennt).
 * Default fällt auf mario.grabner@mynlp.at zurück, falls nicht
 * konfiguriert.
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

export function canUseRechnungsBot(
  ctx: Pick<SessionContext, "isAdmin" | "user"> | null,
): boolean {
  if (!ctx?.isAdmin) return false;
  const email = ctx.user.email.trim().toLowerCase();
  return allowedEmails().includes(email);
}
