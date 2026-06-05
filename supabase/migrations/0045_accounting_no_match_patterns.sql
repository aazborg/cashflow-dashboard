-- Lern-Patterns: welche Bank-Buchungen brauchen KEIN Rechnungs-Match.
-- Z.B. Gehalt, Privatentnahme, Steuer-Vorauszahlung.
--
-- Workflow:
--   1. Mario klickt im Dashboard bei einer Buchung auf "Kein Match nötig".
--   2. Bot speichert ein Pattern (default: counterparty_name).
--   3. Beim naechsten Upload prueft der Bot fuer jede neue Buchung,
--      ob ihre counterparty_name in den Patterns ist -> auto-ignored.

CREATE TABLE IF NOT EXISTS public.accounting_no_match_patterns (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- exakter counterparty-Name (case-insensitive via lower-Index)
    counterparty_name   text NOT NULL,
    -- optional: nur fuer dieses Konto. NULL = alle Konten
    bank_account_id     uuid REFERENCES public.accounting_bank_accounts(id)
                          ON DELETE CASCADE,
    -- Beschreibung warum, fuer den User
    reason              text,
    -- Wenn false: Bot wendet das Pattern nicht automatisch an
    -- (kann der User pausieren ohne zu loeschen)
    auto_apply          boolean NOT NULL DEFAULT true,
    -- Statistik: wie oft hat das Pattern bei Uploads gegriffen
    matches_count       integer NOT NULL DEFAULT 0,
    last_matched_at     timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by_email    text
);

-- Eindeutig pro Konto + Name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS no_match_pat_unique_idx
    ON public.accounting_no_match_patterns
        (lower(trim(counterparty_name)),
         COALESCE(bank_account_id::text, ''));

CREATE INDEX IF NOT EXISTS no_match_pat_name_idx
    ON public.accounting_no_match_patterns
        (lower(trim(counterparty_name)))
    WHERE auto_apply = true;

ALTER TABLE public.accounting_no_match_patterns
    ENABLE ROW LEVEL SECURITY;
