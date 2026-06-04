-- Buchhaltung-Posteingang: Mails von rechnung@mynlp.at
-- + von Claude-Vision-PDF-Parser extrahierte Rechnungen + Positionen.
--
-- Datenfluss:
--   1. Bot polled Gmail alle 15 Min, schreibt jede neue Mail in
--      accounting_inbox_emails (Source-of-truth: was kam an).
--   2. Pro PDF-Anhang -> Claude Vision -> strukturiertes JSON ->
--      accounting_invoices (1:1 Mail:Rechnung erwartet, aber Mail
--      kann 0..N Rechnungen enthalten).
--   3. Aus dem JSON werden die Einzelpositionen
--      in accounting_invoice_positions geschrieben.
--
-- Idempotenz: gmail_message_id als UNIQUE.

CREATE TABLE IF NOT EXISTS public.accounting_inbox_emails (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gmail_message_id    text NOT NULL UNIQUE,
    gmail_thread_id     text,
    received_at         timestamptz NOT NULL,
    from_email          text,
    from_name           text,
    subject             text,
    snippet             text,
    -- Wieviele PDFs hatte die Mail? Erste Zaehlung waehrend des
    -- Mail-Imports, bevor Claude ueberhaupt geparsed hat.
    attachment_count    integer NOT NULL DEFAULT 0,
    -- Status-Werte:
    --   "pending"     -> Mail eingelesen, noch nicht verarbeitet
    --   "parsed"      -> >=1 PDF-Rechnung erfolgreich extrahiert
    --   "no_pdf"      -> Mail enthielt nichts Verwertbares
    --   "link_found"  -> Mail enthaelt Link auf Rechnungs-Download
    --                    -> Dashboard fragt Mario nach Login-Weg
    --   "text_only"   -> Rechnungs-Daten inline im Mail-Text
    --                    -> Phase 2: aus HTML eine PDF generieren
    --                    -> aktuell: manueller Followup
    --   "error"       -> Parsing failed, Details in last_error
    status              text NOT NULL DEFAULT 'pending',
    last_error          text,
    -- Wenn status='link_found': URL aus dem Mail-Body
    rechnung_link_url   text,
    processed_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_inbox_received_idx
    ON public.accounting_inbox_emails (received_at DESC);
CREATE INDEX IF NOT EXISTS acc_inbox_status_idx
    ON public.accounting_inbox_emails (status, received_at DESC);

ALTER TABLE public.accounting_inbox_emails ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.accounting_invoices (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inbox_email_id          uuid REFERENCES public.accounting_inbox_emails(id)
                                  ON DELETE SET NULL,
    -- Original-PDF im Drive
    drive_file_id           text,
    drive_file_url          text,
    drive_filename          text,
    -- Stammdaten (vom Claude-Vision-Parser)
    lieferant_name          text,
    lieferant_address       text,
    lieferant_email         text,
    lieferant_steuernummer  text,
    lieferant_uid           text,
    rechnung_nr             text,
    rechnungsdatum          date,
    leistungszeitraum_von   date,
    leistungszeitraum_bis   date,
    faelligkeit             date,
    -- Betraege (alle in EUR; fuer andere Waehrungen extra Spalte)
    waehrung                text DEFAULT 'EUR',
    netto                   numeric(12,2),
    ust_summe               numeric(12,2),
    brutto                  numeric(12,2),
    -- Bankdaten
    iban                    text,
    bic                     text,
    verwendungszweck        text,
    -- Status im Buchhaltungs-Workflow
    -- "offen"       -> noch nicht zugeordnet
    -- "zugeordnet"  -> mit Bank-Transaktion gematched
    -- "bezahlt"     -> als bezahlt markiert
    -- "duplikat"    -> Doppelt empfangen, ignoriert
    -- "rejected"    -> nicht relevant (z.B. Werbe-PDF)
    status                  text NOT NULL DEFAULT 'offen',
    -- Roh-JSON vom Claude-Parser fuer Audit + Re-Parse
    parser_raw_json         jsonb,
    parser_confidence       numeric(3,2),   -- 0.00 .. 1.00
    parser_warnings         text[],
    parsed_at               timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_inv_email_idx
    ON public.accounting_invoices (inbox_email_id);
CREATE INDEX IF NOT EXISTS acc_inv_status_idx
    ON public.accounting_invoices (status, rechnungsdatum DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS acc_inv_lieferant_idx
    ON public.accounting_invoices (lower(lieferant_name));
CREATE INDEX IF NOT EXISTS acc_inv_rgnr_idx
    ON public.accounting_invoices (lieferant_name, rechnung_nr)
    WHERE rechnung_nr IS NOT NULL;
CREATE INDEX IF NOT EXISTS acc_inv_datum_idx
    ON public.accounting_invoices (rechnungsdatum DESC NULLS LAST);

ALTER TABLE public.accounting_invoices ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.accounting_invoice_positions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          uuid NOT NULL
                          REFERENCES public.accounting_invoices(id)
                          ON DELETE CASCADE,
    position_nr         integer,
    beschreibung        text,
    menge               numeric(12,3),
    einheit             text,
    einzelpreis_netto   numeric(12,2),
    ust_satz            numeric(5,2),
    summe_netto         numeric(12,2),
    summe_brutto        numeric(12,2),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_pos_inv_idx
    ON public.accounting_invoice_positions (invoice_id, position_nr);

ALTER TABLE public.accounting_invoice_positions ENABLE ROW LEVEL SECURITY;


-- Audit-Log fuer Inbox-Polling-Laeufe (analog snapshot_log)
CREATE TABLE IF NOT EXISTS public.accounting_inbox_sync_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at          timestamptz NOT NULL DEFAULT now(),
    finished_at         timestamptz,
    mails_seen          integer DEFAULT 0,
    mails_new           integer DEFAULT 0,
    invoices_parsed     integer DEFAULT 0,
    invoices_failed     integer DEFAULT 0,
    error               text
);

CREATE INDEX IF NOT EXISTS acc_sync_log_idx
    ON public.accounting_inbox_sync_log (started_at DESC);

ALTER TABLE public.accounting_inbox_sync_log ENABLE ROW LEVEL SECURITY;
