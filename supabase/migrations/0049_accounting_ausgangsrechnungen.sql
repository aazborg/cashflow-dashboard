-- ----------------------------------------------------------------------
-- 0049: accounting_ausgangsrechnungen
--
-- Ausgangsrechnungen (vom Aussteller AAZB an Kunden) fuer den
-- Monatsabschluss. Getrennt von accounting_invoices (= Eingangs-
-- rechnungen von Lieferanten), weil hier der KUNDE im Fokus steht und
-- es eine fortlaufende Nummernkreis-Pruefung gibt.
--
-- typ: 'rechnung' | 'storno' (Stornorechnungen werden separat
-- hochgeladen und liegen in Drive unter Ausgangsrechnungen/Storno/).
-- ----------------------------------------------------------------------
create table if not exists public.accounting_ausgangsrechnungen (
    id              uuid primary key default gen_random_uuid(),
    kunde_name      text,
    kunde_adresse   text,
    rechnung_nr     text,
    rechnung_nr_num bigint,           -- numerischer Teil (Luecken-Pruefung)
    rechnungsdatum  date,
    netto           numeric,
    ust_summe       numeric,
    brutto          numeric,
    waehrung        text default 'EUR',
    typ             text not null default 'rechnung',  -- 'rechnung'|'storno'
    drive_file_id   text,
    drive_file_url  text,
    drive_filename  text,
    sha256          text,
    parser_raw_json jsonb,
    parser_confidence numeric,
    uploaded_by_email text,
    created_at      timestamptz default now()
);

create unique index if not exists accounting_ausgangsrechnungen_sha_uniq
    on public.accounting_ausgangsrechnungen (sha256)
    where sha256 is not null;

create index if not exists accounting_ausgangsrechnungen_datum_idx
    on public.accounting_ausgangsrechnungen (rechnungsdatum);

create index if not exists accounting_ausgangsrechnungen_nrnum_idx
    on public.accounting_ausgangsrechnungen (rechnung_nr_num);

comment on table public.accounting_ausgangsrechnungen is
    'Ausgangsrechnungen (AAZB -> Kunde) fuer den Monatsabschluss. '
    'rechnung_nr_num = numerischer Teil der Re-Nr fuer Luecken-Pruefung.';
