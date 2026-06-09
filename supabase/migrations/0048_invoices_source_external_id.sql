-- ----------------------------------------------------------------------
-- 0048: accounting_invoices.source_external_id
--
-- Connector-spezifische ID der Rechnung auf der Quell-Plattform.
-- Beispiele:
--   facebook-ads  → Meta-Transaktions-ID ("27200138536342168-...")
--   stripe        → Stripe-Invoice-ID ("in_1OabcdEFG...")
--   amazon        → Bestellnummer + Index ("305-1234567-8901234-0")
--
-- Wird zum Dedup verwendet: (source_id, source_external_id) ist eindeutig.
-- Damit kann derselbe Monat mehrmals gesynct werden, ohne Duplikate.
-- ----------------------------------------------------------------------
alter table public.accounting_invoices
    add column if not exists source_external_id text;

create unique index if not exists
    accounting_invoices_source_external_uniq
    on public.accounting_invoices (source_id, source_external_id)
    where source_external_id is not null;

comment on column public.accounting_invoices.source_external_id is
    'Externe ID auf der Quell-Plattform (Stripe-Invoice-ID, Meta-Transaktions-ID, ...). '
    'Dedup-Schluessel zusammen mit source_id.';
