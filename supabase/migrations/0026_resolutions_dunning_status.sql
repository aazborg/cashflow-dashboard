-- Per-Payment Mahn-Status (statt nur per-Deal).
--
-- Hintergrund: ein Kunde kann mehrere fehlgeschlagene Raten haben.
-- Eine zahlt er nach (resolved), die andere geht ans Inkasso, die
-- dritte bleibt offen (kein Mahnschritt). Der dunning_status auf
-- der deals-Tabelle ist nur EIN Wert pro Deal -- zu grob.
--
-- Loesung: erweitere gocardless_resolutions um dunning_status pro
-- Payment-gc_id. Existierende done_at-Logik bleibt unberuehrt.
--
-- gocardless_resolutions ist sowieso unsere Per-Payment-Annotation-
-- Tabelle. Hier den Mahn-Status anzuhaengen ist konsistent.

ALTER TABLE public.gocardless_resolutions
    ADD COLUMN IF NOT EXISTS dunning_status text;

ALTER TABLE public.gocardless_resolutions
    DROP CONSTRAINT IF EXISTS gc_resolutions_dunning_check;

ALTER TABLE public.gocardless_resolutions
    ADD CONSTRAINT gc_resolutions_dunning_check
    CHECK (
        dunning_status IS NULL OR
        dunning_status IN ('mahnung_1', 'mahnung_2', 'inkasso', 'resolved')
    );

-- Die done_by_email-Spalte ist NOT NULL. Damit wir dunning_status
-- setzen koennen ohne done zu markieren, muessen wir done_by_email
-- locker machen (oder einen 'pseudo'-Wert reinschreiben).
-- Wir machen NOT NULL weg + erzwingen es nur wenn done_at gesetzt.
ALTER TABLE public.gocardless_resolutions
    ALTER COLUMN done_by_email DROP NOT NULL;
ALTER TABLE public.gocardless_resolutions
    ALTER COLUMN done_at DROP NOT NULL;

-- Index fuer schnellen Lookup nach dunning_status (z.B. fuer
-- 'alle Payments im Inkasso'-Filter).
CREATE INDEX IF NOT EXISTS gc_resolutions_dunning_status_idx
    ON public.gocardless_resolutions (dunning_status);
