-- Cache aller SimplyOrg-Kontakte fuer Teilnehmer-Management.
--
-- Quelle: GET /de/contact_list (paged) + GET /de/address/get-address/<id>
-- Sync:   * taeglich um 06:00 (launchd: contacts-sync.plist)
--         * nach jeder erfolgreichen Rechnungs-Erstellung
--           (sync-one fuer die jeweilige person_id)
--
-- Adress-/Telefon-Felder werden lazy beim ersten Detail-Aufruf befuellt
-- (oder durch den daily Re-Sync). Das vermeidet ~5k Detail-Calls
-- beim ersten Full-Sync. Spalte adresse_status macht den State sichtbar:
--   'pending'  -> nur Basisdaten, Detail noch nicht geholt
--   'fetched'  -> Detail-Call erfolgreich, Felder befuellt
--   'missing'  -> Person hat keine Adresse hinterlegt (oder Fetch leer)
--   'error'    -> letzter Detail-Call ist gescheitert

CREATE TABLE IF NOT EXISTS public.simplyorg_contacts_cache (
    person_id          bigint PRIMARY KEY,
    vorname            text NOT NULL DEFAULT '',
    nachname           text NOT NULL DEFAULT '',
    vollname           text NOT NULL DEFAULT '',
    email              text,
    is_participant     boolean NOT NULL DEFAULT false,
    is_trainer         boolean NOT NULL DEFAULT false,
    -- Adresse + Kontakt (lazy)
    telefon            text,
    mobil              text,
    strasse            text,
    plz                text,
    ort                text,
    land               text,
    address_id         bigint,
    adresse_status     text NOT NULL DEFAULT 'pending'
        CHECK (adresse_status IN ('pending','fetched','missing','error')),
    adresse_geholt_am  timestamptz,
    -- Rohdaten + Audit
    raw                jsonb,
    address_raw        jsonb,
    last_synced_at     timestamptz NOT NULL DEFAULT now(),
    detail_synced_at   timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scc_email_lower_idx
    ON public.simplyorg_contacts_cache (lower(email))
    WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS scc_vollname_lower_idx
    ON public.simplyorg_contacts_cache (lower(vollname));
CREATE INDEX IF NOT EXISTS scc_nachname_lower_idx
    ON public.simplyorg_contacts_cache (lower(nachname));
CREATE INDEX IF NOT EXISTS scc_telefon_idx
    ON public.simplyorg_contacts_cache (telefon)
    WHERE telefon IS NOT NULL;
CREATE INDEX IF NOT EXISTS scc_status_idx
    ON public.simplyorg_contacts_cache (adresse_status);

-- Auto-Update updated_at
CREATE OR REPLACE FUNCTION public.scc_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scc_updated_at_trg
    ON public.simplyorg_contacts_cache;
CREATE TRIGGER scc_updated_at_trg
    BEFORE UPDATE ON public.simplyorg_contacts_cache
    FOR EACH ROW EXECUTE FUNCTION public.scc_set_updated_at();

ALTER TABLE public.simplyorg_contacts_cache ENABLE ROW LEVEL SECURITY;

-- Audit-Log der Syncs (welcher Lauf, wie viele Kontakte, wie lange)
CREATE TABLE IF NOT EXISTS public.simplyorg_contacts_sync_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type       text NOT NULL
        CHECK (sync_type IN ('full','single','detail')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    contacts_seen   integer,
    contacts_upsert integer,
    error           text
);

CREATE INDEX IF NOT EXISTS sccsl_started_idx
    ON public.simplyorg_contacts_sync_log (started_at DESC);

ALTER TABLE public.simplyorg_contacts_sync_log ENABLE ROW LEVEL SECURITY;
