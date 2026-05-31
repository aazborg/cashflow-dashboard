-- Inkasso-Sub-Status fuer die Verfolgung des Inkasso-Verfahrens.
-- 'ergo'      = bei Ergo Versicherung eingereicht
-- 'anwalt'    = an Anwalt uebergeben
-- 'gericht'   = vor Gericht
-- 'gewonnen'  = Urteil/Vergleich zugunsten AAZB
-- 'verloren'  = Forderung uneinbringlich
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS inkasso_stage TEXT
    CHECK (inkasso_stage IS NULL OR inkasso_stage IN
        ('ergo','anwalt','gericht','gewonnen','verloren'));

ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS inkasso_stage_updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS inkasso_stage_note TEXT;

CREATE INDEX IF NOT EXISTS deals_inkasso_stage_idx
    ON public.deals (inkasso_stage)
    WHERE inkasso_stage IS NOT NULL;
