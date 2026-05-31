-- GC-Mandat-Status direkt auf dem Deal -- damit man auch ohne
-- Notiz-Vorlage ein SEPA-Mandat anlegen kann (Email + Vertrag aus
-- HubSpot/Drive reichen). Spiegelt die GC-Spalten die bisher nur auf
-- notiz_vorlagen lagen.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_customer_id TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_mandate_id TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_mandate_status TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_mandate_reference TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_subscription_id TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_subscription_status TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_env TEXT;

CREATE INDEX IF NOT EXISTS deals_gc_mandate_status_idx
    ON public.deals (gocardless_mandate_status)
    WHERE gocardless_mandate_status IS NOT NULL;
