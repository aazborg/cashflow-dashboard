-- GoCardless-Cache: Payments + Mandate als Spiegel in Supabase.
--
-- Motivation: Live-Fetch aus GC dauert ~17s (Cloudflare-Tunnel +
-- Pagination + Customer-Lookup). Mit Cache <500ms direkt aus Postgres.
--
-- Strategie: gocardless-sync (alle 30 Min) iteriert ALLE Payments +
-- Mandate aus GC und UPSERTet in diese Tabellen. Dashboard liest
-- direkt via PostgREST (server-side mit SERVICE_ROLE_KEY).
--
-- Sicherheit: KEINE IBAN/BIC, keine Payment-Details. Nur GC-IDs +
-- Status + Beträge + denormalisierte Name/Email für Sortier-/Filter-
-- Zwecke. Customer-Resolution: zuerst Supabase-Deal, fallback GC
-- (siehe rechnungs_webhook._build_customer_map).
--
-- RLS: Tabellen sind NUR via SERVICE_ROLE_KEY zugänglich (kein
-- anon-Read). Browser kommt nie direkt ran -- nur Next.js
-- server-Routes mit Auth.

-- =====================================================================
-- gocardless_payments_cache
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.gocardless_payments_cache (
    gc_id                   text PRIMARY KEY,
    amount_cents            integer,
    currency                text,
    status                  text,
    charge_date             date,
    description             text,
    reference               text,
    created_at_gc           timestamptz,
    -- Customer-Snapshot (denormalisiert für schnelle Listen-Render)
    customer_id             text,
    customer_name           text,
    customer_email          text,
    mitarbeiter             text,
    deal_id                 uuid,
    -- Links
    mandate_id              text,
    subscription_id         text,
    instalment_schedule_id  text,
    -- Sync-Metadaten
    env                     text NOT NULL DEFAULT 'live',
    synced_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gcp_cache_charge_date_desc
    ON public.gocardless_payments_cache (charge_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS gcp_cache_status
    ON public.gocardless_payments_cache (status);
CREATE INDEX IF NOT EXISTS gcp_cache_customer_id
    ON public.gocardless_payments_cache (customer_id);
CREATE INDEX IF NOT EXISTS gcp_cache_deal_id
    ON public.gocardless_payments_cache (deal_id);
CREATE INDEX IF NOT EXISTS gcp_cache_mandate_id
    ON public.gocardless_payments_cache (mandate_id);
CREATE INDEX IF NOT EXISTS gcp_cache_env
    ON public.gocardless_payments_cache (env);

ALTER TABLE public.gocardless_payments_cache ENABLE ROW LEVEL SECURITY;

-- Keine anon-Policy -- nur SERVICE_ROLE_KEY (bypassed RLS).

-- =====================================================================
-- gocardless_mandates_cache
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.gocardless_mandates_cache (
    gc_id                       text PRIMARY KEY,
    status                      text,
    scheme                      text,
    reference                   text,
    created_at_gc               timestamptz,
    next_possible_charge_date   date,
    -- Customer-Snapshot
    customer_id                 text,
    customer_name               text,
    customer_email              text,
    mitarbeiter                 text,
    deal_id                     uuid,
    -- Sync-Metadaten
    env                         text NOT NULL DEFAULT 'live',
    synced_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gcm_cache_status
    ON public.gocardless_mandates_cache (status);
CREATE INDEX IF NOT EXISTS gcm_cache_created_at
    ON public.gocardless_mandates_cache (created_at_gc DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS gcm_cache_customer_id
    ON public.gocardless_mandates_cache (customer_id);
CREATE INDEX IF NOT EXISTS gcm_cache_env
    ON public.gocardless_mandates_cache (env);

ALTER TABLE public.gocardless_mandates_cache ENABLE ROW LEVEL SECURITY;
