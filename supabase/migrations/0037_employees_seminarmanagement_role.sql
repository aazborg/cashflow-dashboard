-- Neue Rolle 'seminarmanagement' fuer Catering- und Lieferkoordination.
-- Sieht NUR den Bereich /seminarmanagement (Seminarvorbereitung,
-- Produkt-Bestellungen). KEIN Zugriff auf Sales, Accounting,
-- Teilnehmer-Management oder Admin.

ALTER TABLE public.employees
    DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees
    ADD CONSTRAINT employees_role_check
    CHECK (role IN ('admin', 'member', 'accounting',
                     'customer_happiness', 'seminarmanagement'));
