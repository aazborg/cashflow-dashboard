-- Schatten-Deals: Auto-angelegt vom Bot fuer GoCardless-Customer
-- ohne passenden manuellen/hubspot-Deal. Zweck:
--   * Zahlungs-Tabs koennen die Zeile dem Deal zuordnen
--   * Mahnungs-Modal funktioniert (Mahnung 1/2 + Mandat-Storno)
--
-- WICHTIG: Schatten-Deals sind NICHT Teil der Sales-/Cashflow-Realitaet.
-- Sie haben kein Vertrag, kein Mitarbeiter, kein betrag.
--   * /daten: per Filter is_shadow=false ausgeblendet
--   * /zahlungen: vollstaendig sichtbar (damit Mahnen geht)
--   * cashflow.ts: bei outstanding/forecast komplett ignoriert
--
-- Loeschen: Wer einen "echten" Deal fuer den gleichen Kunden anlegt,
-- sollte den Schatten-Deal danach manuell entfernen oder ueberschreiben.

-- 1) Flag-Spalte
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS is_shadow boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS deals_is_shadow_idx
    ON public.deals (is_shadow);

-- 2) source-CHECK um 'gocardless_shadow' erweitern (defensiv: drop+add)
ALTER TABLE public.deals
    DROP CONSTRAINT IF EXISTS deals_source_check;

ALTER TABLE public.deals
    ADD CONSTRAINT deals_source_check
    CHECK (source IN ('hubspot', 'manual', 'legacy', 'gocardless_shadow'));

-- 3) mitarbeiter_id / mitarbeiter_name NOT NULL muss bleiben (sonst
--    bricht der Rest). Bei Schatten-Deals setzen wir Leer-Strings,
--    die Constraints akzeptieren das. /daten filtert sie ohnehin raus.
