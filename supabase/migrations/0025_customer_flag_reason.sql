-- Customer-Flag bekommt einen 'reason' WARUM kein Mandat OK ist.
-- Bisher war nur status='storniert' moeglich -- zu vage.
-- Jetzt: 3 strukturierte Gruende, damit man auf einen Blick
-- versteht, warum bei dem Kunden kein Mandat existiert:
--
--   vertragsende   - Vertrag regulaer ausgelaufen
--   ueberwiesen    - Kunde zahlt manuell per Ueberweisung
--   inkasso        - Fall ist beim Inkasso (Ergo/Anwalt/Gericht)
--                    -> wird vom Frontend zusaetzlich auf
--                       deals.dunning_status='inkasso' gesetzt

ALTER TABLE public.gocardless_customer_flags
    ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.gocardless_customer_flags
    DROP CONSTRAINT IF EXISTS gocardless_customer_flags_reason_check;

ALTER TABLE public.gocardless_customer_flags
    ADD CONSTRAINT gocardless_customer_flags_reason_check
    CHECK (
        reason IS NULL OR
        reason IN ('vertragsende', 'ueberwiesen', 'inkasso')
    );
