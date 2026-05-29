-- GoCardless-Integration: Status-Tracking pro Notiz-Vorlage (=Deal).
-- WICHTIG: Wir speichern nur Referenz-IDs und Status-Snapshots.
-- KEINE Bankdaten (IBAN/BIC/Bankname). Diese bleiben in GoCardless.
-- Bei DB-Kompromittierung fliessen keine Zahlungsdaten ab.

-- Referenz auf den GoCardless-Customer (CU000123). Beim Sync per
-- Email-Match auf die Notiz-Vorlage gelegt.
alter table public.notiz_vorlagen
    add column if not exists gocardless_customer_id text;

-- Mandate-Status: active|pending_submission|submitted|failed|cancelled|...
alter table public.notiz_vorlagen
    add column if not exists gocardless_mandate_id text;
alter table public.notiz_vorlagen
    add column if not exists gocardless_mandate_status text;
alter table public.notiz_vorlagen
    add column if not exists gocardless_mandate_scheme text;

-- Subscription (laufende Ratenzahlung)
alter table public.notiz_vorlagen
    add column if not exists gocardless_subscription_id text;
alter table public.notiz_vorlagen
    add column if not exists gocardless_subscription_status text;

-- Payment-Aggregates (gespeichert beim Sync, nicht live aus GC)
alter table public.notiz_vorlagen
    add column if not exists gocardless_paid_count integer;
alter table public.notiz_vorlagen
    add column if not exists gocardless_paid_amount_cents bigint;
alter table public.notiz_vorlagen
    add column if not exists gocardless_next_payment_date date;
alter table public.notiz_vorlagen
    add column if not exists gocardless_next_payment_amount_cents bigint;

-- Letzte Fehler (fuer Slack-Alerts + UI-Anzeige)
alter table public.notiz_vorlagen
    add column if not exists gocardless_last_failure_at timestamptz;
alter table public.notiz_vorlagen
    add column if not exists gocardless_last_failure_reason text;

-- Sync-Metadaten
alter table public.notiz_vorlagen
    add column if not exists gocardless_synced_at timestamptz;
alter table public.notiz_vorlagen
    add column if not exists gocardless_env text;  -- 'sandbox' | 'live'

create index if not exists notiz_vorlagen_gc_mandate_status_idx
    on public.notiz_vorlagen (gocardless_mandate_status)
    where gocardless_mandate_status is not null;
create index if not exists notiz_vorlagen_gc_customer_idx
    on public.notiz_vorlagen (gocardless_customer_id)
    where gocardless_customer_id is not null;

-- === Audit-Log: wer hat wann welche Status-Daten gesehen ===
create table if not exists public.gocardless_access_log (
    id uuid primary key default gen_random_uuid(),
    accessed_by_email text not null,
    accessed_at timestamptz not null default now(),
    action text not null,                       -- 'read_status'|'webhook'|'sync'
    vorlage_id uuid references public.notiz_vorlagen(id),
    gocardless_customer_id text,
    gocardless_mandate_id text,
    request_meta jsonb,                         -- ip, user-agent, etc.
    success boolean not null default true,
    error_message text
);

create index if not exists gc_access_log_at_idx
    on public.gocardless_access_log (accessed_at desc);
create index if not exists gc_access_log_who_idx
    on public.gocardless_access_log (accessed_by_email, accessed_at desc);

-- RLS: Tabelle ist Service-Role-only. Normale User koennen NICHTS lesen.
alter table public.gocardless_access_log enable row level security;
create policy gocardless_access_log_no_direct
    on public.gocardless_access_log
    for all using (false) with check (false);
