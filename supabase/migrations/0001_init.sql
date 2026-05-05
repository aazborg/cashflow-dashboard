-- Cashflow Dashboard schema
-- Run in Supabase SQL Editor or via `supabase db push`.

create extension if not exists "uuid-ossp";

create table if not exists employees (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  name text not null,
  hubspot_owner_id text unique,
  role text not null check (role in ('admin', 'member')) default 'member',
  invited_at timestamptz default now(),
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists deals (
  id uuid primary key default uuid_generate_v4(),
  vorname text not null,
  nachname text not null,
  email text,
  mitarbeiter_id text not null,
  mitarbeiter_name text not null,
  owner_email text,
  betrag numeric not null,
  start_datum date,
  anzahl_raten integer,
  intervall text check (intervall in (
    'Einmalzahlung','monatlich','alle 2 Monate','vierteljährlich',
    'alle 4 Monate','halbjährlich','jährlich'
  )),
  hubspot_deal_id text unique,
  source text not null check (source in ('hubspot', 'manual', 'legacy')) default 'manual',
  pending_delete boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists deals_mitarbeiter_idx on deals (mitarbeiter_id);
create index if not exists deals_owner_email_idx on deals (owner_email);

create table if not exists delete_requests (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references deals(id) on delete cascade,
  requested_by_email text not null,
  requested_at timestamptz default now(),
  status text not null check (status in ('pending', 'approved', 'denied')) default 'pending',
  decided_at timestamptz
);

-- Row Level Security: members see/edit only their own deals; admins see all.
alter table employees enable row level security;
alter table deals enable row level security;
alter table delete_requests enable row level security;

-- helper: current employee
create or replace function current_employee() returns employees
language sql stable
as $$
  select * from employees where lower(email) = lower(auth.jwt() ->> 'email') limit 1;
$$;

create or replace function is_admin() returns boolean
language sql stable
as $$
  select coalesce((select role = 'admin' from employees where lower(email) = lower(auth.jwt() ->> 'email')), false);
$$;

drop policy if exists employees_self_read on employees;
create policy employees_self_read on employees for select
  using (lower(email) = lower(auth.jwt() ->> 'email') or is_admin());

drop policy if exists employees_admin_write on employees;
create policy employees_admin_write on employees for all
  using (is_admin()) with check (is_admin());

drop policy if exists deals_member_read on deals;
create policy deals_member_read on deals for select
  using (
    is_admin()
    or owner_email = lower(auth.jwt() ->> 'email')
    or mitarbeiter_id = (select hubspot_owner_id from employees where lower(email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists deals_member_write on deals;
create policy deals_member_write on deals for update
  using (
    is_admin()
    or owner_email = lower(auth.jwt() ->> 'email')
    or mitarbeiter_id = (select hubspot_owner_id from employees where lower(email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists deals_member_insert on deals;
create policy deals_member_insert on deals for insert
  with check (
    is_admin()
    or owner_email = lower(auth.jwt() ->> 'email')
    or mitarbeiter_id = (select hubspot_owner_id from employees where lower(email) = lower(auth.jwt() ->> 'email'))
  );

-- delete only via admin
drop policy if exists deals_admin_delete on deals;
create policy deals_admin_delete on deals for delete using (is_admin());

drop policy if exists delete_requests_member_create on delete_requests;
create policy delete_requests_member_create on delete_requests for insert
  with check (lower(requested_by_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists delete_requests_read on delete_requests;
create policy delete_requests_read on delete_requests for select
  using (is_admin() or lower(requested_by_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists delete_requests_admin_decide on delete_requests;
create policy delete_requests_admin_decide on delete_requests for update
  using (is_admin()) with check (is_admin());
