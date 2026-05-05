-- Re-create intervall check constraint using explicit unicode escapes,
-- in case the previous migration's umlauts got normalized differently.

alter table deals drop constraint if exists deals_intervall_check;
alter table deals add constraint deals_intervall_check
  check (intervall in (
    'Einmalzahlung',
    'monatlich',
    'alle 2 Monate',
    U&'viertelj\00e4hrlich',
    'alle 4 Monate',
    U&'halbj\00e4hrlich',
    U&'j\00e4hrlich'
  ));

alter table products drop constraint if exists products_default_intervall_check;
alter table products add constraint products_default_intervall_check
  check (default_intervall is null or default_intervall in (
    'Einmalzahlung',
    'monatlich',
    'alle 2 Monate',
    U&'viertelj\00e4hrlich',
    'alle 4 Monate',
    U&'halbj\00e4hrlich',
    U&'j\00e4hrlich'
  ));

alter table monthly_snapshots drop constraint if exists monthly_snapshots_intervall_check;
-- snapshots haben kein intervall — nichts zu tun, nur Sicherheit
