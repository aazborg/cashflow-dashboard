-- Neue Rolle 'accounting' fuer Buchhaltungs-Mitarbeiter.
-- Sieht /daten (alle Deals) + /zahlungen + Mahnungs/Inkasso-Aktionen,
-- aber KEINE Sales-Dashboards/Rechner/Setter etc.

-- Falls eine CHECK-Constraint auf role existiert: droppen + neu setzen.
ALTER TABLE public.employees
    DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees
    ADD CONSTRAINT employees_role_check
    CHECK (role IN ('admin', 'member', 'accounting'));
