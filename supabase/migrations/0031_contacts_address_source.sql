-- Quelle der Adresse/Telefon-Daten im Kontakt-Cache.
--
-- 'simplyorg' -- Daten kommen vollstaendig aus SimplyOrg
-- 'mixed'     -- SimplyOrg-Adresse plus HubSpot-Fallback fuer Luecken
-- 'hubspot'   -- SimplyOrg hatte gar nichts, alles aus HubSpot
-- NULL        -- Detail noch nicht geholt oder nirgends Daten gefunden

ALTER TABLE public.simplyorg_contacts_cache
    ADD COLUMN IF NOT EXISTS adresse_quelle text
        CHECK (adresse_quelle IN ('simplyorg','mixed','hubspot'));
