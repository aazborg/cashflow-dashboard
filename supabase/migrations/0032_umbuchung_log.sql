-- Audit + Zähler-Tabelle für Umbuchungen im Teilnehmer-Management.
--
-- Sonderregel LSB-Praxismodule (13 Module aus Reihe 18, ohne
-- Abschlussmodul 27): jede:r TN hat 2 freie Umbuchungen. Ab der
-- 3. fällt eine Gebühr von 70€ an (Artikel 'Umbuchungsgebühr').
-- Der Override-Schalter 'gebuehr_erlassen' entfernt den Eintrag
-- aus dem Zähler.

CREATE TABLE IF NOT EXISTS public.umbuchung_log (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id                bigint NOT NULL,
    person_name              text,
    person_email             text,
    old_event_id             bigint NOT NULL,
    old_event_name           text,
    new_event_id             bigint NOT NULL,
    new_event_name           text,
    is_lsb_praxis            boolean NOT NULL DEFAULT false,
    gebuehrenpflichtig       boolean NOT NULL DEFAULT false,
    gebuehr_erlassen         boolean NOT NULL DEFAULT false,
    kunde_informiert         boolean NOT NULL DEFAULT false,
    simplyorg_rechnung_id    bigint,
    rechnung_versendet_am    timestamptz,
    reason                   text,
    by_email                 text,
    created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS umb_log_person_idx
    ON public.umbuchung_log (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS umb_log_lsb_idx
    ON public.umbuchung_log (person_id)
    WHERE is_lsb_praxis;

ALTER TABLE public.umbuchung_log ENABLE ROW LEVEL SECURITY;
