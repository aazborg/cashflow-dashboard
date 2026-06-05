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
  source: "hubspot" | "manual" | "legacy" | "gocardless_shadow";
  created_at: string;
  pending_delete?: boolean;
  /** Schatten-Deal: vom Bot fuer GoCardless-Customer ohne echtem
   *  Vertrag auto-angelegt. NICHT in /daten / Cashflow / Statistik
   *  sichtbar -- nur in /zahlungen, damit das Mahnungs-Modal greift. */
  is_shadow?: boolean;
  /** Aus dem signierten Drive-Vertrag geparst (vertrags_modell_sync). */
  zahlungsmodell?: "einmal" | "raten" | null;
  raten_info?: string | null;
  vertrag_synced_at?: string | null;
  vertrag_file_name?: string | null;
  vertrag_file_id?: string | null;
  vertrag_not_found?: boolean | null;
  /** GoCardless-Status -- gespiegelt vom create-mandate Endpoint
   *  und vom 30-Min-Sync-Job (gocardless_sync.py). */
  gocardless_customer_id?: string | null;
  gocardless_mandate_id?: string | null;
  gocardless_mandate_status?: string | null;
  gocardless_mandate_reference?: string | null;
  gocardless_subscription_id?: string | null;
  gocardless_subscription_status?: string | null;
  gocardless_synced_at?: string | null;
  gocardless_env?: string | null;
  /** Payment-Aggregate vom 30-Min-Sync. */
  gocardless_paid_count?: number | null;
  gocardless_paid_amount_cents?: number | null;
  gocardless_next_payment_date?: string | null;
  gocardless_next_payment_amount_cents?: number | null;
  gocardless_last_failure_at?: string | null;
  gocardless_last_failure_reason?: string | null;
  vertrag_gesamtbetrag?: number | null;
  /** Dunning-/Mahnungs-Workflow (migration 0017) */
  dunning_status?: "mahnung_1" | "mahnung_2" | "inkasso" | "resolved" | null;
  dunning_updated_at?: string | null;
  dunning_mahnung_count?: number | null;
  dunning_last_failure_amount_cents?: number | null;
  dunning_total_fees_cents?: number | null;
  dunning_inkasso_due_at?: string | null;
  dunning_inkasso_sent_at?: string | null;
  dunning_last_email_at?: string | null;
  /** Sub-Status fuer das Inkasso-Verfahren (migration 0019). */
  inkasso_stage?: "ergo" | "anwalt" | "gericht" | "gewonnen" | "verloren" | null;
  inkasso_stage_updated_at?: string | null;
  inkasso_stage_note?: string | null;
  /** Manuelle Bezahl-Spur aus Kontoauszug-Matching (migration 0046).
   *  Unabhaengig von gocardless_* (Lastschrift) -- erfasst auch
   *  klassische Ueberweisungen. */
  payment_status?: "open" | "paid" | "partial" | null;
  paid_at?: string | null;
  amount_paid?: number | null;
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
  role:
    | "admin"
    | "member"
    | "accounting"
    | "customer_happiness"
    | "seminarmanagement";
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

export interface RechnerEvent {
  id: string;
  mitarbeiter_id: string;
  mitarbeiter_name: string;
  user_email: string | null;
  mode: "provision" | "umsatz" | "setter" | null;
  qualis: number | null;
  showup: number | null;
  close_rate: number | null;
  avg_contract: number | null;
  expected_value: number | null;
  data_month: string | null;
  created_at: string;
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
