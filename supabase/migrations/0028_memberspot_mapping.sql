-- Mapping: SimplyOrg-Position -> Memberspot-Zugang (Offer).
--
-- 2-stufiges Matching:
--   1. simplyorg_id exakt (article/series sind stabil)
--   2. simplyorg_name_norm (vor allem fuer single_event: zukuenftige
--      Einzelseminare mit gleichem Titel aber NEUER event_id sollen
--      automatisch zum gleichen Zugang freigegeben werden, ohne dass
--      die Mapping-Tabelle nachgepflegt werden muss.)
--
-- typ-Werte:
--   'article'      -> SimplyOrg-Artikel-ID
--   'series'       -> SimplyOrg-Reihe (qualification_id)
--   'single_event' -> SimplyOrg-Einzelseminar (event_id) -- IDs aendern
--                     sich pro Termin, Name bleibt

CREATE TABLE IF NOT EXISTS public.position_memberspot_mapping (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    typ                   text NOT NULL CHECK (typ IN ('article', 'series', 'single_event')),
    simplyorg_id          text NOT NULL,
    simplyorg_name        text,
    -- lower(trim) -- fuer name-basiertes Lookup beim Sync neuer Events
    simplyorg_name_norm   text GENERATED ALWAYS AS (
        lower(trim(coalesce(simplyorg_name, '')))
    ) STORED,
    memberspot_offer_id   text NOT NULL,
    memberspot_offer_name text,
    note                  text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pmm_uq
    ON public.position_memberspot_mapping (typ, simplyorg_id, memberspot_offer_id);

CREATE INDEX IF NOT EXISTS pmm_position_idx
    ON public.position_memberspot_mapping (typ, simplyorg_id);
CREATE INDEX IF NOT EXISTS pmm_name_idx
    ON public.position_memberspot_mapping (typ, simplyorg_name_norm)
    WHERE simplyorg_name_norm <> '';

ALTER TABLE public.position_memberspot_mapping ENABLE ROW LEVEL SECURITY;

-- Audit-Log
CREATE TABLE IF NOT EXISTS public.memberspot_grants_log (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    simplyorg_invoice_id text,
    customer_email       text NOT NULL,
    memberspot_offer_id  text NOT NULL,
    memberspot_uid       text,
    response             jsonb,
    error                text,
    triggered_by_email   text,
    triggered_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS msgl_invoice_idx
    ON public.memberspot_grants_log (simplyorg_invoice_id);
CREATE INDEX IF NOT EXISTS msgl_customer_idx
    ON public.memberspot_grants_log (customer_email);

ALTER TABLE public.memberspot_grants_log ENABLE ROW LEVEL SECURITY;
