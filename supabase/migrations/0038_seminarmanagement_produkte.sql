-- Produkt-Definitionen fuer Seminarvorbereitung.
--
-- berechnungs_typ:
--   'pro_monat'              -> Stk/Monat, Wochenbedarf = menge / 4
--   'pro_teilnehmer_woche'   -> Einheit/Person/Woche (Obst, Milch)
--   'pro_teilnehmer_tag'     -> Einheit/Person/Tag
--   'pro_seminartag'         -> Einheit/Seminartag (TN-unabhaengig)
--   'fix_pro_woche'          -> fixer Wochenbedarf

CREATE TABLE IF NOT EXISTS public.seminarmanagement_produkte (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    einheit           text NOT NULL,  -- 'Stk', 'kg', 'L', 'Pkg', ...
    berechnungs_typ   text NOT NULL
        CHECK (berechnungs_typ IN ('pro_monat',
                                     'pro_teilnehmer_woche',
                                     'pro_teilnehmer_tag',
                                     'pro_seminartag',
                                     'fix_pro_woche')),
    menge_pro_einheit numeric(10, 3) NOT NULL,
    sortierung        integer NOT NULL DEFAULT 100,
    aktiv             boolean NOT NULL DEFAULT true,
    notiz             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS smp_sortierung_idx
    ON public.seminarmanagement_produkte (sortierung, name)
    WHERE aktiv;

-- updated_at auto
CREATE OR REPLACE FUNCTION public.smp_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS smp_updated_at_trg
    ON public.seminarmanagement_produkte;
CREATE TRIGGER smp_updated_at_trg
    BEFORE UPDATE ON public.seminarmanagement_produkte
    FOR EACH ROW EXECUTE FUNCTION public.smp_set_updated_at();

ALTER TABLE public.seminarmanagement_produkte ENABLE ROW LEVEL SECURITY;
