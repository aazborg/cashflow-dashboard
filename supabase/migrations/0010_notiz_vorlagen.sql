-- Speichert Angebots-Notizen, die im /notiz-Editor erstellt wurden.
-- Lookup per Kunden-Email -> Mario findet beim spaeteren Rechnung-
-- Erstellen die zugehoerige Notiz wieder (inkl. Positionen, Termine,
-- ausgewaehlte event_ids).
--
-- Eine Email kann mehrere Vorlagen haben (z.B. Re-Angebote nach
-- Vertragsanpassung). Die juengste wird im UI als Default
-- vorgeschlagen.

CREATE TABLE IF NOT EXISTS notiz_vorlagen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kunden-Identifikation
  email              text NOT NULL,
  name               text,
  -- Inhalte
  hauptprodukt       text,
  rechnungstitel     text,
  -- Positionen: das gesamte Zeile[]-Array des Editors als JSON
  -- (inkl. terminBekannt, selectedTerminIds, salesName, catalogTitle,
  --  praefixText, freitext, terminFormat, ...)
  positionen         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Gerendertes Plain-Text (fuer schnelle Anzeige in der Liste)
  notiz_text         text,
  -- Wer hat es angelegt? -- log-only
  created_by_email   text NOT NULL,
  -- Wurde diese Vorlage bereits in eine Rechnung uebernommen?
  rechnung_id        integer,
  rechnung_created_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Lookup: case-insensitiv nach Email + neuste zuerst
CREATE INDEX IF NOT EXISTS notiz_vorlagen_email_idx
  ON notiz_vorlagen (lower(email));
CREATE INDEX IF NOT EXISTS notiz_vorlagen_created_idx
  ON notiz_vorlagen (created_at DESC);

-- updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION notiz_vorlagen_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notiz_vorlagen_updated_at_trg ON notiz_vorlagen;
CREATE TRIGGER notiz_vorlagen_updated_at_trg
  BEFORE UPDATE ON notiz_vorlagen
  FOR EACH ROW EXECUTE FUNCTION notiz_vorlagen_set_updated_at();

-- RLS: alles laeuft ueber service-role (supabaseAdmin) im Server-Code,
-- der die Permission-Logik (canUseRechnungsBot) selbst macht. Daher
-- restriktive Policy -- kein direkter Client-Zugriff.
ALTER TABLE notiz_vorlagen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notiz_vorlagen_no_direct_access ON notiz_vorlagen;
CREATE POLICY notiz_vorlagen_no_direct_access ON notiz_vorlagen
  FOR ALL USING (false) WITH CHECK (false);
