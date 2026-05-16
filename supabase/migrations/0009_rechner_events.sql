-- Aktivitäts-Log für den Zielrechner (/rechner). Jeder Slider-/Eingabe-Stop
-- der länger als ein paar Sekunden gehalten wird, wird als Event geloggt
-- und einmal täglich als Digest an den Admin gemailt.
CREATE TABLE IF NOT EXISTS rechner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id text NOT NULL,
  mitarbeiter_name text NOT NULL,
  user_email text,
  mode text,
  qualis integer,
  showup numeric,
  close_rate numeric,
  avg_contract numeric,
  expected_value numeric,
  data_month text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rechner_events_created_idx
  ON rechner_events (created_at DESC);
CREATE INDEX IF NOT EXISTS rechner_events_mitarbeiter_idx
  ON rechner_events (mitarbeiter_id);
