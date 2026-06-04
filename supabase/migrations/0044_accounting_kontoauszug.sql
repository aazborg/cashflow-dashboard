-- Kontoauszuege + Bank-Transaktionen + Match zu Rechnungen.
--
-- Quellen: Erste Bank Business (CSV/CAMT), Erste KK (PDF), AmEx (PDF/CSV),
-- PayPal (CSV), GoCardless (JSON).
-- Match-Logik (locker): Betrag exakt + Datum innerhalb 90 Tagen vor/nach
-- Rechnungsdatum + Lieferant/RG-Nr im Verwendungszweck.

CREATE TABLE IF NOT EXISTS public.accounting_bank_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- "erste_giro" | "erste_kk" | "amex" | "paypal" | "gocardless"
    quelle          text NOT NULL UNIQUE,
    bezeichnung     text NOT NULL,
    iban            text,           -- optional, kann auch null sein (KK)
    waehrung        text NOT NULL DEFAULT 'EUR',
    aktiv           boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_bank_accounts ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.accounting_bank_statements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id     uuid REFERENCES public.accounting_bank_accounts(id)
                          ON DELETE CASCADE,
    -- "csv_erste" | "camt053" | "pdf_kk" | "csv_paypal" | "json_gocardless"
    format              text NOT NULL,
    original_filename   text,
    drive_file_id       text,
    drive_file_url      text,
    zeitraum_von        date,
    zeitraum_bis        date,
    transaktionen_total integer DEFAULT 0,
    transaktionen_neu   integer DEFAULT 0,
    sha256              text,          -- Idempotenz: gleicher File nochmal -> skip
    uploaded_by_email   text,
    -- "pending" | "parsed" | "error"
    status              text NOT NULL DEFAULT 'pending',
    last_error          text,
    processed_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sha256)
);

CREATE INDEX IF NOT EXISTS acc_stmt_account_idx
    ON public.accounting_bank_statements (bank_account_id, zeitraum_bis DESC);

ALTER TABLE public.accounting_bank_statements ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.accounting_bank_transactions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id     uuid NOT NULL
                          REFERENCES public.accounting_bank_accounts(id)
                          ON DELETE CASCADE,
    statement_id        uuid REFERENCES public.accounting_bank_statements(id)
                          ON DELETE SET NULL,
    -- Bank-eigene ID (E2E/Booking-Id) -- macht Idempotenz pro Bank
    bank_ref            text,
    -- Buchungs-Datum (wann die Bank gebucht hat)
    booking_date        date NOT NULL,
    -- Valuta-Datum (wirtschaftlich)
    value_date          date,
    -- Betrag in der Konto-Waehrung; negativ = Ausgang
    amount              numeric(12,2) NOT NULL,
    waehrung            text NOT NULL DEFAULT 'EUR',
    -- Gegenpartei
    counterparty_name   text,
    counterparty_iban   text,
    -- Verwendungszweck / Memo / Beschreibung
    purpose             text,
    -- Roh-JSON aus dem Parser
    raw                 jsonb,
    -- Status:
    --   "open"     = noch nicht zugeordnet
    --   "matched"  = einer Rechnung zugeordnet (Eintrag in *_matches)
    --   "ignored"  = manuell als irrelevant markiert (z.B. Privat-Buchung)
    status              text NOT NULL DEFAULT 'open',
    created_at          timestamptz NOT NULL DEFAULT now(),
    -- Idempotenz: gleiche Bank + gleiche Bank-Ref -> Update statt Insert
    UNIQUE (bank_account_id, bank_ref)
);

CREATE INDEX IF NOT EXISTS acc_trx_booking_idx
    ON public.accounting_bank_transactions (booking_date DESC);
CREATE INDEX IF NOT EXISTS acc_trx_amount_idx
    ON public.accounting_bank_transactions (amount, booking_date);
CREATE INDEX IF NOT EXISTS acc_trx_status_idx
    ON public.accounting_bank_transactions (status, booking_date DESC);
CREATE INDEX IF NOT EXISTS acc_trx_counterparty_idx
    ON public.accounting_bank_transactions (lower(counterparty_name));

ALTER TABLE public.accounting_bank_transactions ENABLE ROW LEVEL SECURITY;


-- Many-to-Many: eine Rechnung kann durch mehrere Trx bezahlt sein
-- (Anzahlungen), eine Trx kann mehrere Rechnungen bezahlen (Sammelueberweisung).
CREATE TABLE IF NOT EXISTS public.accounting_invoice_matches (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          uuid NOT NULL
                          REFERENCES public.accounting_invoices(id)
                          ON DELETE CASCADE,
    transaction_id      uuid NOT NULL
                          REFERENCES public.accounting_bank_transactions(id)
                          ON DELETE CASCADE,
    -- Wieviel der Trx auf diese Rechnung entfaellt (default = voller Betrag)
    amount              numeric(12,2),
    -- "auto_strong" = exakter Match (Betrag + Lieferant + RG-Nr)
    -- "auto_amount" = nur Betrag-Match (locker)
    -- "manual"      = User hat zugeordnet
    -- "suggested"   = Bot schlaegt vor, User muss bestaetigen
    match_type          text NOT NULL,
    confidence          numeric(3,2),
    notes               text,
    confirmed_by_email  text,
    confirmed_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (invoice_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS acc_match_inv_idx
    ON public.accounting_invoice_matches (invoice_id);
CREATE INDEX IF NOT EXISTS acc_match_trx_idx
    ON public.accounting_invoice_matches (transaction_id);

ALTER TABLE public.accounting_invoice_matches ENABLE ROW LEVEL SECURITY;


-- Konto-Stammdaten gleich miteintragen
INSERT INTO public.accounting_bank_accounts (quelle, bezeichnung, waehrung)
VALUES
    ('erste_giro', 'Erste Bank Business Girokonto', 'EUR'),
    ('erste_kk',   'Erste Bank Kreditkarte',        'EUR'),
    ('amex',       'American Express Business',     'EUR'),
    ('paypal',     'PayPal Business',               'EUR'),
    ('gocardless', 'GoCardless Auszahlungen',       'EUR')
ON CONFLICT (quelle) DO NOTHING;
