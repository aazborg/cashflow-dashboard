-- Pro Setter und Monat die Anzahl der erschienenen Qualis. Bildet die
-- Bemessungsgrundlage für die variable Setter-Vergütung (Tier-Tabelle in
-- setter-tiers.ts: aktive Stufe ergibt sich aus der Quali-Anzahl, perBg
-- multipliziert mit Quali-Anzahl = variabler Anteil).
CREATE TABLE IF NOT EXISTS setter_monthly_qualis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id text NOT NULL,
  month text NOT NULL,
  qualis integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mitarbeiter_id, month)
);

CREATE INDEX IF NOT EXISTS setter_monthly_qualis_month_idx
  ON setter_monthly_qualis (month);
