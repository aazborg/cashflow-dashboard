-- Neue Rolle 'customer_happiness' fuer Customer-Happiness-Mitarbeiter.
-- Sieht NUR /teilnehmer-management (Kontakt-Suche). KEIN Zugriff auf
-- Sales-Dashboards, Accounting-Tabs oder Admin-Bereiche.
--
-- Admins sehen Teilnehmer-Management ohnehin -- die Rolle ist die
-- Whitelist fuer reine Customer-Happiness-Accounts.

ALTER TABLE public.employees
    DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees
    ADD CONSTRAINT employees_role_check
    CHECK (role IN ('admin', 'member', 'accounting', 'customer_happiness'));
