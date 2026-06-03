-- Lieferanten + Zuordnung zu Kategorien.
--
-- Spaeter automatische Bestell-Mails pro Lieferant: die Mail
-- enthaelt alle Produkte der zugeordneten Kategorie(n) mit
-- berechnetem Wochenbedarf.

CREATE TABLE IF NOT EXISTS public.seminarmanagement_lieferanten (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    telefon     text,
    email       text,
    notiz       text,
    aktiv       boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sml_name_idx
    ON public.seminarmanagement_lieferanten (lower(name))
    WHERE aktiv;

CREATE OR REPLACE FUNCTION public.sml_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS sml_updated_at_trg
    ON public.seminarmanagement_lieferanten;
CREATE TRIGGER sml_updated_at_trg
    BEFORE UPDATE ON public.seminarmanagement_lieferanten
    FOR EACH ROW EXECUTE FUNCTION public.sml_set_updated_at();

ALTER TABLE public.seminarmanagement_lieferanten
    ENABLE ROW LEVEL SECURITY;


-- M:N -- ein Lieferant kann mehrere Kategorien bedienen,
-- eine Kategorie kann von mehreren Lieferanten bedient werden.
CREATE TABLE IF NOT EXISTS public.seminarmanagement_lieferant_kategorie (
    lieferant_id uuid NOT NULL
        REFERENCES public.seminarmanagement_lieferanten(id)
        ON DELETE CASCADE,
    kategorie_id uuid NOT NULL
        REFERENCES public.seminarmanagement_kategorien(id)
        ON DELETE CASCADE,
    PRIMARY KEY (lieferant_id, kategorie_id)
);

CREATE INDEX IF NOT EXISTS smlk_kategorie_idx
    ON public.seminarmanagement_lieferant_kategorie (kategorie_id);

ALTER TABLE public.seminarmanagement_lieferant_kategorie
    ENABLE ROW LEVEL SECURITY;
