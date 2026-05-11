-- Beginn und Ende des Dienstverhältnisses. Werden im Cashflow-Dashboard
-- verwendet, um Fixum-Auszahlungen außerhalb der Beschäftigungszeit
-- auszublenden:
--   employment_start: erster Tag, ab dem Fixum gezählt wird
--   employment_end:   letzter Tag mit Fixum (ab dem Folgemonat null)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_start date,
  ADD COLUMN IF NOT EXISTS employment_end date;
