/**
 * HubSpot-Import-Blacklist:
 *   - liest die Tabelle hubspot_import_blacklist
 *   - prueft fuer einen Kandidaten (dealId/email/vorname+nachname)
 *     ob er importiert werden soll
 *
 * Die Tabelle ist klein (manuell gepflegte Liste) -> wir cachen alle
 * Eintraege pro Sync-Lauf in Memory.
 */
import { supabaseAdmin } from "@/lib/supabase";

export type BlacklistEntry = {
  id: string;
  hubspot_deal_id: string | null;
  email: string | null;
  vorname: string | null;
  nachname: string | null;
  reason: string | null;
  blocked_at: string;
  blocked_by_email: string | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();

export type BlacklistIndex = {
  byDealId: Set<string>;
  byEmail: Set<string>;
  byName: Set<string>;
};

export async function loadBlacklist(): Promise<BlacklistIndex> {
  const { data, error } = await supabaseAdmin()
    .from("hubspot_import_blacklist")
    .select("hubspot_deal_id,email,vorname,nachname");
  if (error) {
    console.warn("[blacklist] load failed:", error.message);
    return {
      byDealId: new Set(),
      byEmail: new Set(),
      byName: new Set(),
    };
  }
  const byDealId = new Set<string>();
  const byEmail = new Set<string>();
  const byName = new Set<string>();
  for (const r of (data ?? []) as BlacklistEntry[]) {
    if (r.hubspot_deal_id) byDealId.add(r.hubspot_deal_id);
    if (r.email) byEmail.add(norm(r.email));
    if (r.vorname && r.nachname) {
      byName.add(`${norm(r.vorname)}|${norm(r.nachname)}`);
    }
  }
  return { byDealId, byEmail, byName };
}

export function isBlacklisted(
  idx: BlacklistIndex,
  candidate: {
    hubspot_deal_id?: string | null;
    email?: string | null;
    vorname?: string | null;
    nachname?: string | null;
  },
): boolean {
  if (
    candidate.hubspot_deal_id &&
    idx.byDealId.has(candidate.hubspot_deal_id)
  )
    return true;
  if (candidate.email && idx.byEmail.has(norm(candidate.email))) return true;
  if (candidate.vorname && candidate.nachname) {
    const key = `${norm(candidate.vorname)}|${norm(candidate.nachname)}`;
    if (idx.byName.has(key)) return true;
  }
  return false;
}

/** Eine Einzelpruefung — laedt die Blacklist frisch. Fuer Webhook-
 * Pfad (selten genug, dass Cache-Aufbau okay ist). */
export async function isBlacklistedFresh(candidate: {
  hubspot_deal_id?: string | null;
  email?: string | null;
  vorname?: string | null;
  nachname?: string | null;
}): Promise<boolean> {
  const idx = await loadBlacklist();
  return isBlacklisted(idx, candidate);
}
