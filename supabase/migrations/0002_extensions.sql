-- Erweiterungen seit 0001: Funnel-Defaults & Provision auf employees,
-- Produktkatalog, Monats-Snapshots.

-- ── employees: zusätzliche Spalten ──────────────────────────────────────────
alter table employees add column if not exists provision_pct numeric;
alter table employees add column if not exists default_qualis numeric;
alter table employees add column if not exists default_showup_rate numeric;
alter table employees add column if not exists default_close_rate numeric;
alter table employees add column if not exists default_avg_contract numeric;

-- ── products ────────────────────────────────────────────────────────────────
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price numeric not null check (price >= 0),
  default_anzahl_raten integer,
  default_intervall text check (default_intervall in (
    'Einmalzahlung','monatlich','alle 2 Monate','vierteljährlich',
    'alle 4 Monate','halbjährlich','jährlich'
  )),
  active boolean not null default true,
  is_upsell boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists products_sort_idx on products (sort);

alter table products enable row level security;

drop policy if exists products_read on products;
create policy products_read on products for select
  using (auth.role() = 'authenticated');

drop policy if exists products_admin_write on products;
create policy products_admin_write on products for all
  using (is_admin()) with check (is_admin());

-- ── monthly_snapshots ───────────────────────────────────────────────────────
create table if not exists monthly_snapshots (
  id uuid primary key default uuid_generate_v4(),
  mitarbeiter_id text not null,
  month text not null,  -- YYYY-MM
  qualis numeric not null,
  showup_rate numeric not null,  -- 0-100
  close_rate numeric not null,   -- 0-100
  avg_contract numeric,
  created_at timestamptz default now(),
  unique (mitarbeiter_id, month)
);

create index if not exists monthly_snapshots_mit_idx on monthly_snapshots (mitarbeiter_id);

alter table monthly_snapshots enable row level security;

drop policy if exists snapshots_read on monthly_snapshots;
create policy snapshots_read on monthly_snapshots for select
  using (
    is_admin()
    or mitarbeiter_id = (select hubspot_owner_id from employees where lower(email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists snapshots_admin_write on monthly_snapshots;
create policy snapshots_admin_write on monthly_snapshots for all
  using (is_admin()) with check (is_admin());
