-- Erledigt-Status fuer Zertifikate (Bulk-Markierung + Auto bei Druck).

ALTER TABLE public.zertifikate
    ADD COLUMN IF NOT EXISTS erledigt_am timestamptz,
    ADD COLUMN IF NOT EXISTS erledigt_von text;

CREATE INDEX IF NOT EXISTS zert_erledigt_idx
    ON public.zertifikate (erledigt_am DESC)
    WHERE erledigt_am IS NOT NULL;
