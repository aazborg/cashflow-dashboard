-- Payment-Aggregate auf deals spiegeln, damit die Zahlungen-
-- Uebersicht ohne Notiz-Vorlage-Join auskommt. Der 30-Min-Sync
-- patcht diese Felder synchron mit notiz_vorlagen.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_paid_count INTEGER;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_paid_amount_cents BIGINT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_next_payment_date DATE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_next_payment_amount_cents BIGINT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_last_failure_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS gocardless_last_failure_reason TEXT;
-- Vertrag-Gesamtbetrag (aus parsedem Vertrag), wird vom
-- vertrags_modell_sync mit gefuellt. Wenn nicht da, fallback
-- auf deal.betrag bzw. betrag_original.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS vertrag_gesamtbetrag NUMERIC(12, 2);
