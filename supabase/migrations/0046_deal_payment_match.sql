-- Match-Tabelle: deals (Ausgangsrechnungen) ↔ accounting_bank_transactions
-- (Eingangs-Buchungen vom Kunden).
--
-- Auto-Match-Logik (im Bot): bei jeder Eingangs-Trx im Auszug pruefen
-- ob ein Deal mit:
--   - passendem Betrag (exakt oder als Rate)
--   - Vor-/Nachname im counterparty_name oder purpose
--   - start_datum -/+ 180 Tage Distanz
-- existiert. Wenn ja -> Match anlegen.

CREATE TABLE IF NOT EXISTS public.deal_payment_matches (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id             uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    transaction_id      uuid NOT NULL REFERENCES public.accounting_bank_transactions(id)
                          ON DELETE CASCADE,
    -- Wieviel der Trx auf diesen Deal entfaellt
    amount              numeric(12,2),
    -- "auto_strong" = Betrag + Name passten exakt
    -- "auto_amount" = nur Betrag matched (locker)
    -- "manual"      = User hat zugeordnet
    match_type          text NOT NULL,
    confidence          numeric(3,2),
    notes               text,
    confirmed_by_email  text,
    confirmed_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (deal_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS deal_pay_deal_idx
    ON public.deal_payment_matches (deal_id);
CREATE INDEX IF NOT EXISTS deal_pay_trx_idx
    ON public.deal_payment_matches (transaction_id);

ALTER TABLE public.deal_payment_matches ENABLE ROW LEVEL SECURITY;


-- Bezahlstatus in deals:
--   "open"     -> noch nicht bezahlt
--   "paid"     -> voll bezahlt (entweder Einmal oder alle Raten)
--   "partial"  -> teilweise bezahlt (Raten-Modus, manche schon eingegangen)
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS paid_at        timestamptz,
    ADD COLUMN IF NOT EXISTS amount_paid    numeric(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS deals_payment_status_idx
    ON public.deals (payment_status, start_datum DESC NULLS LAST);
