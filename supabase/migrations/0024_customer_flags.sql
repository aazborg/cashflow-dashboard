-- Customer-Level Markierungen (z.B. 'storniert OK' wenn der Kunde
-- bewusst keinen aktiven Lastschrift-Mandat mehr hat).
--
-- Eine Zeile pro GoCardless-Customer-ID. Standard: nicht markiert
-- (kein Eintrag). Markierung = explizite Aussage "ist OK so".
--
-- UI nutzt das fuer eine Ampel pro Zeile in /zahlungen:
--   gruen  -> Kunde hat aktives Mandat ODER ist als 'storniert' markiert
--   rot    -> Kein aktives Mandat UND keine Markierung -> potentielles Geldloch
--
-- Eigene Tabelle (nicht auf deals), weil ein Kunde mehrere Deals
-- haben kann -- der Flag gilt pro Customer-ID.

CREATE TABLE IF NOT EXISTS public.gocardless_customer_flags (
    gc_customer_id   text PRIMARY KEY,
    status           text NOT NULL CHECK (status IN ('storniert')),
    marked_at        timestamptz NOT NULL DEFAULT now(),
    marked_by_email  text NOT NULL,
    note             text,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gc_customer_flags_status_idx
    ON public.gocardless_customer_flags (status);

ALTER TABLE public.gocardless_customer_flags
    ENABLE ROW LEVEL SECURITY;
-- Keine anon-Policy -- nur SERVICE_ROLE_KEY.
