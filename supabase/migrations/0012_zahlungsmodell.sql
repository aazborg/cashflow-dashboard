-- Zahlungsmodell aus dem signierten Vertrag.
--   'einmal' = Einmalzahlung (Default)
--   'raten'  = Ratenzahlung mit SEPA-Mandat
-- raten_info enthaelt den Rohtext aus der Vertrags-Section
-- 'Zahlungsvereinbarung' fuer Mario zur visuellen Pruefung
-- (z.B. 'Von Juni - Dez 2026: 430 EUR/Mo; ab Jan 2027: 25x 585,31 EUR').
alter table public.notiz_vorlagen
    add column if not exists zahlungsmodell text;
alter table public.notiz_vorlagen
    add column if not exists raten_info text;

create index if not exists notiz_vorlagen_zahlungsmodell_idx
    on public.notiz_vorlagen (zahlungsmodell)
    where zahlungsmodell is not null;
