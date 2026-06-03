-- Zertifikats-Verwaltung im Teilnehmer-Management.
--
-- Quelle: ein Google-Drive-Folder in dem ein Zapier-Flow die
-- Zertifikat-Dokumente ablegt. Der Bot pollt den Folder taeglich
-- und upsertet die Dateien in diese Tabelle.

CREATE TABLE IF NOT EXISTS public.zertifikate (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    google_doc_id      text NOT NULL UNIQUE,
    name               text NOT NULL,
    -- Geparste Felder aus dem Dateinamen (best-effort)
    teilnehmer_name    text,
    teilnehmer_email   text,
    seminar_titel      text,
    -- Drive-Metadaten
    created_at_drive   timestamptz,
    modified_at_drive  timestamptz,
    google_doc_url     text,
    google_pdf_url     text,
    -- Audit + UI-Annotationen
    gedruckt_am        timestamptz,
    versendet_am       timestamptz,
    notiz              text,
    synced_at          timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zert_created_drive_idx
    ON public.zertifikate (created_at_drive DESC);
CREATE INDEX IF NOT EXISTS zert_name_idx
    ON public.zertifikate (lower(teilnehmer_name));
CREATE INDEX IF NOT EXISTS zert_email_idx
    ON public.zertifikate (lower(teilnehmer_email));

ALTER TABLE public.zertifikate ENABLE ROW LEVEL SECURITY;
