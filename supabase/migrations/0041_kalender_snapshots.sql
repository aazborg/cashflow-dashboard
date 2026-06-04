-- Taegliche Kalender-Snapshots aus SimplyOrg, damit jede Aenderung
-- (Datum-Verschiebung, Storno, neue Termine) rueckwirkend
-- nachvollziehbar ist.
--
-- Pro Snapshot-Datum ein vollstaendiger Stand aller aktiven Events
-- + ihrer Schedules. Storage: ~5000 Schedule-Zeilen pro Tag.

CREATE TABLE IF NOT EXISTS public.simplyorg_event_snapshots (
    snapshot_date       date NOT NULL,
    event_id            bigint NOT NULL,
    event_name          text,
    event_startdate     date,
    event_enddate       date,
    location            text,
    max_registration    integer,
    aktive              integer,
    qualification_id    bigint,
    qualification_name  text,
    event_status        text,
    is_completed        boolean,
    raw                 jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_date, event_id)
);

CREATE INDEX IF NOT EXISTS sevsnap_event_idx
    ON public.simplyorg_event_snapshots (event_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS sevsnap_qid_idx
    ON public.simplyorg_event_snapshots (qualification_id, snapshot_date DESC)
    WHERE qualification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sevsnap_name_idx
    ON public.simplyorg_event_snapshots (lower(event_name));
CREATE INDEX IF NOT EXISTS sevsnap_startdate_idx
    ON public.simplyorg_event_snapshots (event_startdate);

ALTER TABLE public.simplyorg_event_snapshots ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.simplyorg_schedule_snapshots (
    snapshot_date    date NOT NULL,
    schedule_id      bigint NOT NULL,
    event_id         bigint NOT NULL,
    schedule_date    date,
    start_time       text,
    end_time         text,
    title            text,
    trainer_names    text,
    location_name    text,
    raw              jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_date, schedule_id)
);

CREATE INDEX IF NOT EXISTS sschsnap_event_idx
    ON public.simplyorg_schedule_snapshots (event_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS sschsnap_date_idx
    ON public.simplyorg_schedule_snapshots (schedule_date);
CREATE INDEX IF NOT EXISTS sschsnap_snapshot_date_idx
    ON public.simplyorg_schedule_snapshots (snapshot_date);

ALTER TABLE public.simplyorg_schedule_snapshots ENABLE ROW LEVEL SECURITY;


-- Audit-Log fuer Snapshot-Laeufe
CREATE TABLE IF NOT EXISTS public.simplyorg_snapshot_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    snapshot_date   date,
    events_seen     integer,
    schedules_seen  integer,
    error           text
);

CREATE INDEX IF NOT EXISTS ssnaplog_started_idx
    ON public.simplyorg_snapshot_log (started_at DESC);

ALTER TABLE public.simplyorg_snapshot_log ENABLE ROW LEVEL SECURITY;
