-- Kategorien fuer Seminarmanagement-Produkte (Obst, Suesses,
-- Milch, ...). Frei erweiterbar.

CREATE TABLE IF NOT EXISTS public.seminarmanagement_kategorien (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    sortierung  integer NOT NULL DEFAULT 100,
    aktiv       boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS smk_sortierung_idx
    ON public.seminarmanagement_kategorien (sortierung, name)
    WHERE aktiv;

ALTER TABLE public.seminarmanagement_kategorien
    ENABLE ROW LEVEL SECURITY;

-- Default-Kategorien (idempotent durch UNIQUE name).
INSERT INTO public.seminarmanagement_kategorien (name, sortierung)
VALUES ('Obst', 10), ('Süßes', 20), ('Milch', 30)
ON CONFLICT (name) DO NOTHING;

-- Produkte um kategorie_id + nullable berechnungs_typ/menge erweitern.
ALTER TABLE public.seminarmanagement_produkte
    ADD COLUMN IF NOT EXISTS kategorie_id uuid
        REFERENCES public.seminarmanagement_kategorien(id)
        ON DELETE SET NULL,
    ALTER COLUMN berechnungs_typ DROP NOT NULL,
    ALTER COLUMN menge_pro_einheit DROP NOT NULL;

CREATE INDEX IF NOT EXISTS smp_kategorie_idx
    ON public.seminarmanagement_produkte (kategorie_id)
    WHERE aktiv;
