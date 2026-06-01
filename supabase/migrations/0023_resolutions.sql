-- Manuelle 'Erledigt'-Markierungen fuer Payments + Mandate.
--
-- Bewusst SEPARATE Tabelle (kein Spalten-Anhang an *_cache),
-- weil der Bot-Sync die Cache-Tabellen alle 30 Min komplett
-- upsertet -- ein Spalten-Update wuerde dabei wieder ueberschrieben.
--
-- Eine Zeile = ein Erledigt-Marker. UNIQUE(gc_id, kind) sorgt fuer
-- Idempotenz: erneutes 'erledigt'-Markieren wird zum Update.
--
-- Loeschen einer Zeile = Erledigt-Marker entfernen (rueckgaengig).

CREATE TABLE IF NOT EXISTS public.gocardless_resolutions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gc_id         text NOT NULL,
    kind          text NOT NULL CHECK (kind IN ('payment', 'mandate')),
    done_at       timestamptz NOT NULL DEFAULT now(),
    done_by_email text NOT NULL,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gocardless_resolutions_uq
    ON public.gocardless_resolutions (gc_id, kind);

CREATE INDEX IF NOT EXISTS gocardless_resolutions_kind_idx
    ON public.gocardless_resolutions (kind);

ALTER TABLE public.gocardless_resolutions
    ENABLE ROW LEVEL SECURITY;
-- Kein anon-Zugriff -- nur Service-Role schreibt/liest.
