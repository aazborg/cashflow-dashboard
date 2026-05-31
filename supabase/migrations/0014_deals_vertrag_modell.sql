-- Vertrag-Modell direkt auf den Deal: damit auch HubSpot-Deals
-- ohne Notiz-Vorlage sofort anzeigen, ob es laut Vertrag eine
-- Einmal- oder Ratenzahlung ist.
--
-- Befuellt durch:
--   - manuell ueber den 'Vertrag-neu-parsen'-Button im DealRow
--   - automatisch via vertrags_modell_sync.py (alle 2h)
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS zahlungsmodell TEXT;

ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS raten_info TEXT;

ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS vertrag_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS vertrag_file_name TEXT;

-- Marker: kein Vertrag in Drive gefunden (vermeidet repeated lookups).
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS vertrag_not_found BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS deals_zahlungsmodell_idx
    ON public.deals (zahlungsmodell)
    WHERE zahlungsmodell IS NOT NULL;
