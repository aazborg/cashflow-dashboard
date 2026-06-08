-- Quellen-System für die Buchhaltung: Anbieter-Plattformen (Anthropic,
-- Vercel, Zoom, ...) die monatliche Rechnungen liefern. Pro Plattform
-- ein "Connector" der die Rechnungen via API oder Playwright-Browser
-- abruft, in Drive ablegt und in accounting_invoices einliest.
--
-- Sicherheit:
--   - accounting_sources_credentials liegen verschluesselt
--     (AES-GCM mit CREDENTIALS_MASTER_KEY in der Bot-.env).
--     Browser/Dashboard liest NUR den Status "Credentials gesetzt: ja/nein".
--   - Service-Role-Key bleibt server-side, RLS-Policies decken alles ab.
--
-- Beziehung zu accounting_invoices: neue Spalte source_id (FK).
-- Bestehende Rechnungen aus Email-Inbox bekommen source_id=NULL.


-- ---------------------------------------------------------------
-- 1) Plattform-Quellen (master)
-- ---------------------------------------------------------------
create table if not exists public.accounting_sources (
    id                  uuid primary key default gen_random_uuid(),
    -- Slug ist URL-safe und eindeutig: 'anthropic', 'vercel', 'zoom-billing'
    slug                text not null unique
                        check (slug ~ '^[a-z0-9][a-z0-9-]*$' and length(slug) between 2 and 60),
    -- Anzeige-Name fuer die UI
    name                text not null check (length(name) between 1 and 100),
    -- Login-Methode: 'api' = REST/GraphQL mit Token, 'browser' = Playwright,
    -- 'email_only' = Plattform schickt Mail (kein aktives Polling noetig).
    login_type          text not null
                        check (login_type in ('api', 'browser', 'email_only')),
    -- Lifecycle: learning = wird gerade angelernt, testing = darf nichts
    -- echtes anlegen, active = produktiv, paused = manuell deaktiviert,
    -- error = letzter Sync hart gescheitert.
    status              text not null default 'learning'
                        check (status in ('learning', 'testing', 'active', 'paused', 'error')),
    -- Erwartete Anzahl Rechnungen pro Monat (z.B. 1 = monatliche Abo-
    -- Rechnung). 0 = "gelegentlich, kein Monatsabgleich". Wird im Tab
    -- "fehlt"-Liste als Soll-Wert genutzt.
    expected_per_month  integer not null default 1
                        check (expected_per_month >= 0),
    -- Login-URL (Plattform-Startseite oder Login-Page) — fuer
    -- BrowserConnector als Basis, fuer "manuell oeffnen"-Link in der UI.
    login_url           text,
    -- Connector-spezifische Config als JSONB (z.B. CSS-Selektoren fuer
    -- Browser, API-Endpoints fuer API-Connector). Schema je nach
    -- login_type unterschiedlich.
    config              jsonb not null default '{}'::jsonb,
    -- Aktivitaet
    last_synced_at      timestamptz,
    last_sync_status    text check (last_sync_status in ('ok', 'error', 'partial', 'no_new')),
    last_sync_error     text,
    last_sync_invoices_found integer,
    -- Audit
    notes               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    created_by          text,                -- email
    updated_by          text                 -- email
);

create index if not exists accounting_sources_status_idx
    on public.accounting_sources (status);

create index if not exists accounting_sources_last_sync_idx
    on public.accounting_sources (last_synced_at desc nulls last);


-- ---------------------------------------------------------------
-- 2) Credentials (verschluesselt)
-- ---------------------------------------------------------------
-- Pro Quelle koennen mehrere Credential-Eintraege existieren (z.B.
-- "username" + "password" + "totp_secret"). Werte sind AES-GCM-
-- verschluesselt — der Bot entschluesselt nur in-memory.
create table if not exists public.accounting_sources_credentials (
    id                  uuid primary key default gen_random_uuid(),
    source_id           uuid not null
                        references public.accounting_sources(id) on delete cascade,
    -- Identifier fuer den Wert: 'username', 'password', 'totp_secret',
    -- 'api_token', 'session_cookie', ...
    kind                text not null
                        check (length(kind) between 1 and 50),
    -- AES-GCM-Ciphertext (base64): nonce|ciphertext|tag konkateniert.
    encrypted_value     text not null,
    -- Hilfs-Info fuer die UI ("zuletzt gesetzt am ...") — kein Wert.
    set_at              timestamptz not null default now(),
    set_by              text,                -- email
    unique (source_id, kind)
);


-- ---------------------------------------------------------------
-- 3) Sync-Run-Historie
-- ---------------------------------------------------------------
-- Eine Zeile pro Sync-Versuch. Sehr nuetzlich fuer "warum hat der Bot
-- am 5.6. nichts geholt?".
create table if not exists public.accounting_sources_sync_log (
    id                  uuid primary key default gen_random_uuid(),
    source_id           uuid not null
                        references public.accounting_sources(id) on delete cascade,
    started_at          timestamptz not null default now(),
    finished_at         timestamptz,
    triggered_by        text not null default 'cron'
                        check (triggered_by in ('cron', 'manual', 'on_demand')),
    triggered_by_email  text,
    -- Zielmonat des Pulls (YYYY-MM)
    target_month        text check (target_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    -- Ergebnis
    status              text check (status in ('ok', 'error', 'partial', 'no_new', 'aborted')),
    invoices_found      integer not null default 0,
    invoices_imported   integer not null default 0,
    invoices_failed     integer not null default 0,
    error               text,
    -- Pro-Rechnung Details (optional, hilft beim Debuggen)
    details             jsonb
);

create index if not exists sync_log_source_idx
    on public.accounting_sources_sync_log (source_id, started_at desc);


-- ---------------------------------------------------------------
-- 4) accounting_invoices: source_id-Ruckverweis
-- ---------------------------------------------------------------
-- Bestehende Rechnungen (aus Email-Inbox) bleiben source_id=NULL.
alter table public.accounting_invoices
    add column if not exists source_id uuid
        references public.accounting_sources(id) on delete set null;

create index if not exists accounting_invoices_source_idx
    on public.accounting_invoices (source_id);


-- ---------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------
alter table public.accounting_sources enable row level security;
alter table public.accounting_sources_credentials enable row level security;
alter table public.accounting_sources_sync_log enable row level security;

-- Nur Service-Role darf alles. Eingeloggte Admins/Accounting duerfen
-- accounting_sources lesen/schreiben (UI), aber NIEMALS credentials.
drop policy if exists "sources_select_authenticated"
    on public.accounting_sources;
create policy "sources_select_authenticated"
    on public.accounting_sources for select
    to authenticated using (true);

drop policy if exists "sources_modify_service_only"
    on public.accounting_sources;
create policy "sources_modify_service_only"
    on public.accounting_sources for all
    to service_role using (true) with check (true);

-- Credentials: NIEMALS aus dem Browser. Nur Service-Role.
drop policy if exists "credentials_service_only"
    on public.accounting_sources_credentials;
create policy "credentials_service_only"
    on public.accounting_sources_credentials for all
    to service_role using (true) with check (true);

-- Sync-Log: Service-Role schreibt, authenticated darf lesen (fuer UI).
drop policy if exists "sync_log_select_authenticated"
    on public.accounting_sources_sync_log;
create policy "sync_log_select_authenticated"
    on public.accounting_sources_sync_log for select
    to authenticated using (true);

drop policy if exists "sync_log_modify_service_only"
    on public.accounting_sources_sync_log;
create policy "sync_log_modify_service_only"
    on public.accounting_sources_sync_log for all
    to service_role using (true) with check (true);


-- ---------------------------------------------------------------
-- 6) Trigger: updated_at automatisch nachziehen
-- ---------------------------------------------------------------
create or replace function public.touch_accounting_sources_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_accounting_sources_updated_at
    on public.accounting_sources;
create trigger trg_accounting_sources_updated_at
    before update on public.accounting_sources
    for each row execute function public.touch_accounting_sources_updated_at();
