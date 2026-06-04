-- Blacklist fuer den HubSpot-Deal-Import. Drei Match-Modi:
--   1. hubspot_deal_id (haargenau diesen Deal)
--   2. email (alle Deals dieser Person, case-insensitive)
--   3. vorname + nachname (Fallback fuer Kontakte ohne Email,
--      case-insensitive, lower+trim)
-- Mindestens einer der drei Identifier muss gesetzt sein.

CREATE TABLE IF NOT EXISTS public.hubspot_import_blacklist (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hubspot_deal_id     text,
    email               text,
    vorname             text,
    nachname            text,
    reason              text,
    blocked_at          timestamptz NOT NULL DEFAULT now(),
    blocked_by_email    text,
    CONSTRAINT hubspot_blacklist_min_one CHECK (
        hubspot_deal_id IS NOT NULL
        OR email IS NOT NULL
        OR (vorname IS NOT NULL AND nachname IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS hubspot_bl_deal_idx
    ON public.hubspot_import_blacklist (hubspot_deal_id)
    WHERE hubspot_deal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hubspot_bl_email_idx
    ON public.hubspot_import_blacklist (lower(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hubspot_bl_name_idx
    ON public.hubspot_import_blacklist
        (lower(trim(vorname)), lower(trim(nachname)))
    WHERE vorname IS NOT NULL AND nachname IS NOT NULL;

ALTER TABLE public.hubspot_import_blacklist ENABLE ROW LEVEL SECURITY;
