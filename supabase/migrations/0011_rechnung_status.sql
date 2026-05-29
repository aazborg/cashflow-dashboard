-- Status-Tracking der erstellten SimplyOrg-Rechnung.
--   'draft'  = im SimplyOrg-System angelegt, noch nicht versendet
--   'sent'   = per Bot-Workflow per Email an den Kunden geschickt
-- Default null = noch keine Rechnung erzeugt.
alter table public.notiz_vorlagen
    add column if not exists rechnung_status text;

create index if not exists notiz_vorlagen_rechnung_status_idx
    on public.notiz_vorlagen (rechnung_status)
    where rechnung_status is not null;
