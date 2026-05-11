export type Intervall =
  | "Einmalzahlung"
  | "monatlich"
  | "alle 2 Monate"
  | "vierteljährlich"
  | "alle 4 Monate"
  | "halbjährlich"
  | "jährlich";

export const INTERVALL_OPTIONS: Intervall[] = [
  "Einmalzahlung",
  "monatlich",
  "alle 2 Monate",
  "vierteljährlich",
  "alle 4 Monate",
  "halbjährlich",
  "jährlich",
];

export const INTERVALL_MONATE: Record<Intervall, number> = {
  "Einmalzahlung": 1,
  "monatlich": 1,
  "alle 2 Monate": 2,
  "vierteljährlich": 3,
  "alle 4 Monate": 4,
  "halbjährlich": 6,
  "jährlich": 12,
};

export interface Deal {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  mitarbeiter_id: string;
  mitarbeiter_name: string;
  /** Provisions-relevanter Betrag — vom Mitarbeiter editierbar. */
  betrag: number;
  /** Ursprünglicher Dealbetrag aus HubSpot. Wird bei jedem HubSpot-Sync
   *  überschrieben und ist nur für Admins sichtbar. Wird für Umsatz-
   *  statistik und Cashflow-Verteilung über Monate verwendet. Optional auf
   *  Input-Seite (createDeal etc.); auf der DB-Zeile immer befüllt. */
  betrag_original?: number | null;
  start_datum: string | null;
  anzahl_raten: number | null;
  intervall: Intervall | null;
  hubspot_deal_id: string | null;
  source: "hubspot" | "manual" | "legacy";
  created_at: string;
  pending_delete?: boolean;
}

export type SetterHours = "20h" | "25h" | "30h" | "35h" | "40h";

export const SETTER_HOURS_OPTIONS: SetterHours[] = [
  "20h", "25h", "30h", "35h", "40h",
];

export interface Employee {
  id: string;
  email: string;
  name: string;
  hubspot_owner_id: string | null;
  role: "admin" | "member";
  is_setter: boolean;
  is_closer: boolean;
  setter_hours: SetterHours | null;
  invited_at: string | null;
  active: boolean;
  provision_pct?: number | null;
  closer_fixum_eur?: number | null;
  /** Erster Tag des Dienstverhältnisses (YYYY-MM-DD). Vor diesem Monat
   *  wird kein Fixum in die monatliche Auszahlung addiert. */
  employment_start?: string | null;
  /** Letzter Tag des Dienstverhältnisses (YYYY-MM-DD). Ab dem Folgemonat
   *  wird kein Fixum mehr in die monatliche Auszahlung addiert. */
  employment_end?: string | null;
  default_qualis?: number | null;
  default_showup_rate?: number | null;
  default_close_rate?: number | null;
  default_avg_contract?: number | null;
}

export interface MonthlySnapshot {
  id: string;
  mitarbeiter_id: string;
  month: string; // YYYY-MM
  qualis: number;
  showup_rate: number; // 0-100
  close_rate: number; // 0-100
  avg_contract?: number | null;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  default_anzahl_raten: number | null;
  default_intervall: Intervall | null;
  active: boolean;
  sort: number;
  /**
   * Upsell innerhalb einer laufenden Beratung — generiert Umsatz, aber
   * benötigt kein eigenes Beratungsgespräch / Funnel.
   */
  is_upsell?: boolean;
}

export interface SetterMonthlyQualis {
  id: string;
  mitarbeiter_id: string;
  month: string; // YYYY-MM
  qualis: number;
  updated_at?: string;
}

export interface DeleteRequest {
  id: string;
  deal_id: string;
  requested_by_email: string;
  requested_at: string;
  status: "pending" | "approved" | "denied";
  decided_at?: string;
}
