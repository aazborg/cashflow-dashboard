-- Dunning-/Mahnungs-Workflow: Status pro Deal.
--
-- Mario's Regel:
--   1. Zahlung fehlgeschlagen -> 30 EUR Gebuehr (GC-Einzelpayment)
--      + 1. Mahnung Email -> status='mahnung_1'
--   2. Nochmals fehlgeschlagen -> wieder 30 EUR + 2. Mahnung Email
--      (schaerfer) -> status='mahnung_2'
--   3. 14 Tage warten, dann Inkasso (an Ergo) -> status='inkasso'
--
-- inkasso_polizzennummer: AAZB's Polizze bei Ergo (1x fix, env).

ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS dunning_status TEXT
    CHECK (dunning_status IS NULL OR dunning_status IN
        ('mahnung_1','mahnung_2','inkasso','resolved'));

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS dunning_updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS dunning_mahnung_count INTEGER DEFAULT 0;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS dunning_last_failure_amount_cents BIGINT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS dunning_total_fees_cents BIGINT DEFAULT 0;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS dunning_inkasso_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS dunning_inkasso_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS dunning_last_email_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS deals_dunning_status_idx
    ON public.deals (dunning_status)
    WHERE dunning_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_dunning_inkasso_due_idx
    ON public.deals (dunning_inkasso_due_at)
    WHERE dunning_inkasso_due_at IS NOT NULL
      AND dunning_inkasso_sent_at IS NULL;

-- Audit-Log fuer Mahnungs-Aktionen
CREATE TABLE IF NOT EXISTS public.dunning_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES public.deals(id),
    action TEXT NOT NULL,  -- 'mahnung_1' | 'mahnung_2' | 'fee_charged' | 'inkasso' | 'resolved'
    triggered_by_email TEXT,
    triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    payment_id_charged TEXT,
    fee_amount_cents BIGINT,
    email_to TEXT,
    email_subject TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    meta JSONB
);

CREATE INDEX IF NOT EXISTS dunning_log_deal_idx ON public.dunning_log (deal_id, triggered_at DESC);

ALTER TABLE public.dunning_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY dunning_log_no_direct ON public.dunning_log
    FOR ALL USING (FALSE) WITH CHECK (FALSE);
