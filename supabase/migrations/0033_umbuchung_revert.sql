-- Tracking fuer rueckgaengig gemachte Umbuchungen.

ALTER TABLE public.umbuchung_log
    ADD COLUMN IF NOT EXISTS rueckgaengig_gemacht_am timestamptz,
    ADD COLUMN IF NOT EXISTS rueckgaengig_gemacht_von text,
    ADD COLUMN IF NOT EXISTS rueckgaengig_grund text;

CREATE INDEX IF NOT EXISTS umb_log_revert_idx
    ON public.umbuchung_log (rueckgaengig_gemacht_am)
    WHERE rueckgaengig_gemacht_am IS NOT NULL;
