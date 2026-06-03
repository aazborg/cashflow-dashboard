-- Termin-Daten der alten + neuen Anmeldung mit im Umbuchungs-Log
-- speichern, damit sie in der Uebersicht ohne Extra-Calls sichtbar
-- sind.

ALTER TABLE public.umbuchung_log
    ADD COLUMN IF NOT EXISTS old_event_von text,
    ADD COLUMN IF NOT EXISTS old_event_bis text,
    ADD COLUMN IF NOT EXISTS new_event_von text,
    ADD COLUMN IF NOT EXISTS new_event_bis text;
